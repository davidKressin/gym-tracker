/**
 * GymTracker App Logic
 * Single Page Application structure
 */

const app = {
    // STATE
    state: {
        user: null,
        authMode: 'login', // 'login' or 'register'
        routines: [],
        history: [],
        activeWorkout: null, // { routineId, currentExerciseIndex, currentSet, logs: [] }
        timerInterval: null,
        timerSeconds: 0,
        workoutInterval: null,
        workoutSeconds: 0,
        editingRoutineId: null,
        historyView: 'list', // 'list' or 'calendar'
        calendarDate: new Date() // Current month being viewed
    },

    // INIT
    init: function () {
        // Check for file:// protocol
        if (window.location.protocol === 'file:') {
            console.warn("Firebase Auth works best with http/https. Persistence might not work on file://");
        }

        // Wait for Firebase to be ready (Race condition fix)
        if (!window.firebaseAuth) {
            console.log("Waiting for Firebase initialization...");
            setTimeout(() => this.init(), 100);
            return;
        }

        // Listen for Auth State
        const { onAuthStateChanged, auth } = window.firebaseAuth;
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.state.user = user;
                document.getElementById('login-view').classList.add('hidden');
                document.getElementById('main-app-content').classList.remove('hidden');
                document.getElementById('user-display-name').innerText = user.email.split('@')[0];

                await this.loadData();
                this.renderRoutines();
                this.renderHistory();
                this.navigate('home-view');
            } else {
                this.state.user = null;
                document.getElementById('login-view').classList.remove('hidden');
                document.getElementById('main-app-content').classList.add('hidden');
            }
        });

        // Prevent accidental back navigation on mobile
        window.history.pushState(null, null, window.location.href);
        window.onpopstate = function () {
            window.history.pushState(null, null, window.location.href);
        };
    },

    // AUTH LOGIC
    switchAuthTab: function (mode) {
        this.state.authMode = mode;
        document.getElementById('tab-login').classList.toggle('active', mode === 'login');
        document.getElementById('tab-register').classList.toggle('active', mode === 'register');
        document.getElementById('auth-submit-btn').innerText = mode === 'login' ? 'Ingresar' : 'Registrarse';
        document.getElementById('auth-error').innerText = '';
    },

    handleAuth: async function (e) {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const errorEl = document.getElementById('auth-error');
        errorEl.innerText = '';

        const { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = window.firebaseAuth;

        try {
            if (this.state.authMode === 'login') {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            console.error("Full Auth Error:", error);
            errorEl.innerText = this.getAuthErrorMessage(error.code);
        }
    },

    logout: async function () {
        const { auth, signOut } = window.firebaseAuth;
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout Error:", error);
        }
    },

    getAuthErrorMessage: function (code) {
        console.log("Error Code:", code);
        switch (code) {
            case 'auth/invalid-email': return 'Email inválido.';
            case 'auth/user-disabled': return 'Usuario deshabilitado.';
            case 'auth/user-not-found': return 'Usuario no encontrado.';
            case 'auth/wrong-password': return 'Contraseña incorrecta.';
            case 'auth/invalid-credential': return 'Credenciales inválidas (email o contraseña incorrectos).';
            case 'auth/email-already-in-use': return 'El email ya está en uso.';
            case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
            case 'auth/operation-not-allowed': return 'El inicio de sesión con email/contraseña no está habilitado en Firebase.';
            case 'auth/network-request-failed': return 'Error de red. Revisa tu conexión.';
            case 'auth/too-many-requests': return 'Demasiados intentos. Intenta más tarde.';
            default: return `Error (${code}): Intenta de nuevo.`;
        }
    },

    // NAVIGATION
    navigate: function (viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
        document.getElementById(viewId).classList.add('active-view');

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        if (viewId === 'home-view') document.querySelector('.nav-btn[onclick*="home-view"]').classList.add('active');
        if (viewId === 'history-view') document.querySelector('.nav-btn[onclick*="history-view"]').classList.add('active');

        // Clear editor if navigating there and not editing
        if (viewId === 'routine-editor-view' && !this.state.editingRoutineId) {
            this.setupRoutineEditor();
        }
    },

    // DATA MANAGEMENT
    loadData: async function () {
        const { db, doc, getDoc } = window.firebaseAuth;
        const userId = this.state.user.uid;

        try {
            const docRef = doc(db, "users", userId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                this.state.routines = data.routines || [];
                this.state.history = data.history || [];
                console.log("Data loaded from Firestore");
            } else {
                // Check for migration from localStorage
                const storedRoutines = localStorage.getItem('gym_routines');
                const storedHistory = localStorage.getItem('gym_history');

                if (storedRoutines || storedHistory) {
                    console.log("Migrating data from localStorage to Firestore...");
                    if (storedRoutines) this.state.routines = JSON.parse(storedRoutines);
                    if (storedHistory) this.state.history = JSON.parse(storedHistory);

                    await this.saveData(); // Save to Firestore

                    // Clear localStorage after migration
                    localStorage.removeItem('gym_routines');
                    localStorage.removeItem('gym_history');
                }
            }
        } catch (error) {
            console.error("Error loading data from Firestore:", error);
        }
    },

    saveData: async function () {
        const { db, doc, setDoc } = window.firebaseAuth;
        const userId = this.state.user.uid;

        try {
            const docRef = doc(db, "users", userId);
            await setDoc(docRef, {
                routines: this.state.routines,
                history: this.state.history
            });
            console.log("Data saved to Firestore");
            this.renderRoutines(); // Refresh UI
        } catch (error) {
            console.error("Error saving data to Firestore:", error);
        }
    },

    deleteHistoryItem: async function (startTime, event) {
        if (event) event.stopPropagation();
        if (confirm('¿Borrar esta entrada del historial?')) {
            this.state.history = this.state.history.filter(h => h.startTime !== startTime);
            await this.saveData();
            this.renderHistory();
        }
    },

    // ROUTINE MANAGEMENT
    renderRoutines: function () {
        const list = document.getElementById('routines-list');
        list.innerHTML = '';

        if (this.state.routines.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>No tienes rutinas. Crea una nueva!</p></div>';
            return;
        }

        this.state.routines.forEach(routine => {
            const card = document.createElement('div');
            card.className = 'routine-card';
            card.onclick = (e) => {
                if (!e.target.closest('.card-actions')) this.startWorkout(routine.id);
            };

            const exerciseCount = routine.exercises.length;
            const exercisesSummary = routine.exercises.map(e => e.name).slice(0, 3).join(', ') + (exerciseCount > 3 ? '...' : '');

            card.innerHTML = `
                <h3>${routine.name}</h3>
                <p>${exerciseCount} Ejercicios: ${exercisesSummary}</p>
                <div class="card-actions">
                   <button class="btn-icon" onclick="app.editRoutine('${routine.id}', event)">
                        <ion-icon name="create-outline"></ion-icon>
                   </button>
                   <button class="btn-icon" onclick="app.deleteRoutine('${routine.id}', event)">
                        <ion-icon name="trash-outline"></ion-icon>
                   </button>
                </div>
            `;
            list.appendChild(card);
        });
    },

    setupRoutineEditor: function () {
        document.getElementById('routine-name-input').value = '';
        document.getElementById('exercises-list-editor').innerHTML = '';
        this.addExerciseInput(); // Add one default
    },

    editRoutine: function (id, event) {
        if (event) event.stopPropagation();
        const routine = this.state.routines.find(r => r.id === id);
        if (!routine) return;

        this.state.editingRoutineId = id;

        // Populate inputs
        document.getElementById('routine-name-input').value = routine.name;
        const container = document.getElementById('exercises-list-editor');
        container.innerHTML = '';

        routine.exercises.forEach(ex => {
            this.addExerciseInput(ex);
        });

        this.navigate('routine-editor-view');
    },

    addExerciseInput: function (data = null) {
        const container = document.getElementById('exercises-list-editor');
        const count = container.children.length + 1;
        const div = document.createElement('div');
        div.className = 'exercise-input-group';
        div.innerHTML = `
            <div style="margin-bottom:10px;">
                <label>Nombre Ejercicio</label>
                <input type="text" class="ex-name" placeholder="Ej. Squat" value="${data ? data.name : ''}">
            </div>
            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label>Series</label>
                    <input type="number" class="ex-sets" value="${data ? data.sets : 3}">
                </div>
                <div style="flex:1;">
                    <label>Descanso (seg)</label>
                    <input type="number" class="ex-rest" value="${data ? data.rest : 60}">
                </div>
            </div>
            <button class="btn-delete-ex" onclick="this.parentElement.remove()">
                <ion-icon name="trash-outline"></ion-icon>
            </button>
        `;
        container.appendChild(div);
    },

    saveRoutine: async function () {
        const name = document.getElementById('routine-name-input').value;
        if (!name) return alert('Ponle un nombre a la rutina!');

        const exercisesDOM = document.querySelectorAll('.exercise-input-group');
        const exercises = [];
        exercisesDOM.forEach(group => {
            const exName = group.querySelector('.ex-name').value;
            const sets = parseInt(group.querySelector('.ex-sets').value) || 3;
            const rest = parseInt(group.querySelector('.ex-rest').value) || 60;
            if (exName) exercises.push({ name: exName, sets, rest });
        });

        if (exercises.length === 0) return alert('Agrega al menos un ejercicio.');

        if (this.state.editingRoutineId) {
            // Update existing
            const idx = this.state.routines.findIndex(r => r.id === this.state.editingRoutineId);
            if (idx !== -1) {
                this.state.routines[idx].name = name;
                this.state.routines[idx].exercises = exercises;
            }
            this.state.editingRoutineId = null;
        } else {
            // Create new
            const newRoutine = {
                id: Date.now().toString(),
                name,
                exercises
            };
            this.state.routines.push(newRoutine);
        }

        await this.saveData();
        this.navigate('home-view');
    },

    deleteRoutine: async function (id) {
        if (confirm('¿Borrar esta rutina?')) {
            this.state.routines = this.state.routines.filter(r => r.id !== id);
            await this.saveData();
        }
    },

    // WORKOUT LOGIC
    startWorkout: function (routineId) {
        const routine = this.state.routines.find(r => r.id === routineId);
        if (!routine) return;

        this.state.activeWorkout = {
            routineId: routine.id,
            routineName: routine.name,
            currentExerciseIndex: 0,
            currentSet: 1,
            startTime: new Date().toISOString(),
            logs: []
        };

        this.startWorkoutTimer();
        this.updateWorkoutUI(routine);
        this.navigate('workout-view');
    },

    startWorkoutTimer: function () {
        this.state.workoutSeconds = 0;
        clearInterval(this.state.workoutInterval); // Safety
        this.updateWorkoutDurationDisplay();

        this.state.workoutInterval = setInterval(() => {
            this.state.workoutSeconds++;
            this.updateWorkoutDurationDisplay();
        }, 1000);
    },

    updateWorkoutDurationDisplay: function () {
        const h = Math.floor(this.state.workoutSeconds / 3600);
        const m = Math.floor((this.state.workoutSeconds % 3600) / 60);
        const s = this.state.workoutSeconds % 60;

        let str = "";
        if (h > 0) {
            str = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        } else {
            str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }

        const el = document.getElementById('workout-duration-timer');
        if (el) el.innerText = str;
    },

    updateWorkoutUI: function (routine) {
        const idx = this.state.activeWorkout.currentExerciseIndex;
        const exercise = routine.exercises[idx];

        document.getElementById('active-routine-name').innerText = routine.name;
        document.getElementById('current-exercise-index').innerText = `${idx + 1}/${routine.exercises.length}`;

        const progressPct = ((idx) / routine.exercises.length) * 100;
        document.getElementById('workout-progress-fill').style.width = `${progressPct}%`;

        document.getElementById('active-exercise-name').innerText = exercise.name;
        document.getElementById('current-set-num').innerText = this.state.activeWorkout.currentSet;
        document.getElementById('total-sets-num').innerText = exercise.sets;
        document.getElementById('target-rest-time').innerText = exercise.rest;

        // Display Previous Max Weight & Reps
        const prevBest = this.getPreviousBestSet(routine.id, exercise.name);
        const infoEl = document.getElementById('prev-max-weight');
        if (infoEl) {
            infoEl.innerText = prevBest ? `Anterior Máx: ${prevBest.weight}kg x ${prevBest.reps} reps` : 'Sin registro previo';
        }

        // Reset inputs for convenience or keep prev if helpful? Let's reset.
        // Or better: try to auto-fill with prev set if available
        document.getElementById('weight-input').value = '';
        // document.getElementById('reps-input').value = ''; // Let's leave reps empty or default to something? default 0
    },

    getPreviousBestSet: function (routineId, exerciseName) {
        // Find the last session of the same routine
        const lastSession = this.state.history.find(h => h.routineId === routineId);
        if (!lastSession) return null;

        // Extract logs for the specific exercise
        const relevantLogs = lastSession.logs
            .filter(log => log.exercise === exerciseName && log.weight && log.weight !== "");

        if (relevantLogs.length === 0) return null;

        // Sort to find the best set: Highest weight, then highest reps
        relevantLogs.sort((a, b) => {
            const wA = parseFloat(a.weight);
            const wB = parseFloat(b.weight);
            if (wA !== wB) return wB - wA;
            return (parseInt(b.reps) || 0) - (parseInt(a.reps) || 0);
        });

        return {
            weight: relevantLogs[0].weight,
            reps: relevantLogs[0].reps
        };
    },

    finishSet: function () {
        const routine = this.state.routines.find(r => r.id === this.state.activeWorkout.routineId);
        const exercise = routine.exercises[this.state.activeWorkout.currentExerciseIndex];

        const weight = document.getElementById('weight-input').value;
        const reps = document.getElementById('reps-input').value;

        // Log the set
        this.state.activeWorkout.logs.push({
            exercise: exercise.name,
            set: this.state.activeWorkout.currentSet,
            weight: weight,
            reps: reps,
            timestamp: new Date().toISOString()
        });

        // Start Timer Overlay
        this.startRestTimer(exercise.rest);
    },

    nextSetOrExercise: function () {
        const routine = this.state.routines.find(r => r.id === this.state.activeWorkout.routineId);
        const exercise = routine.exercises[this.state.activeWorkout.currentExerciseIndex];

        if (this.state.activeWorkout.currentSet < exercise.sets) {
            // Next Set
            this.state.activeWorkout.currentSet++;
            this.updateWorkoutUI(routine);
        } else {
            // Next Exercise
            if (this.state.activeWorkout.currentExerciseIndex < routine.exercises.length - 1) {
                this.state.activeWorkout.currentExerciseIndex++;
                this.state.activeWorkout.currentSet = 1;
                this.updateWorkoutUI(routine);
            } else {
                // Workout Finished
                this.finishWorkout();
            }
        }
    },

    finishWorkout: async function () {
        this.state.activeWorkout.endTime = new Date().toISOString();
        this.state.history.unshift(this.state.activeWorkout);
        await this.saveData(); // Save history
        clearInterval(this.state.workoutInterval);
        this.state.activeWorkout = null;
        alert('Entrenamiento Terminado! 💪');
        this.renderHistory();
        this.navigate('history-view');
    },

    confirmExitWorkout: function () {
        if (confirm('¿Salir del entrenamiento actual? Se perderá el progreso no guardado.')) {
            clearInterval(this.state.workoutInterval);
            this.state.activeWorkout = null;
            this.navigate('home-view');
        }
    },

    // TIMER
    startRestTimer: function (seconds) {
        document.getElementById('rest-overlay').classList.remove('hidden');
        this.state.timerSeconds = seconds;
        this.updateTimerDisplay();

        this.state.timerInterval = setInterval(() => {
            this.state.timerSeconds--;
            this.updateTimerDisplay();

            if (this.state.timerSeconds <= 0) {
                this.stopTimerAndProceed();
                this.playBeep();
            }
        }, 1000);
    },

    adjustTimer: function (delta) {
        this.state.timerSeconds += delta;
        if (this.state.timerSeconds < 0) this.state.timerSeconds = 0;
        this.updateTimerDisplay();
    },

    skipRest: function () {
        this.stopTimerAndProceed();
    },

    stopTimerAndProceed: function () {
        clearInterval(this.state.timerInterval);
        document.getElementById('rest-overlay').classList.add('hidden');
        this.nextSetOrExercise();
    },

    updateTimerDisplay: function () {
        const m = Math.floor(this.state.timerSeconds / 60);
        const s = this.state.timerSeconds % 60;
        const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        document.getElementById('timer-display').innerText = str;
    },

    playBeep: function () {
        // Simple Audio Context beep
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.start();
        setTimeout(() => osc.stop(), 500);
    },

    // HISTORY & EXPORT
    renderHistory: function () {
        const container = document.getElementById('history-list');
        container.innerHTML = '';
        if (this.state.history.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-secondary)">Sin historial</p>';
            return;
        }

        this.state.history.forEach(log => {
            const date = new Date(log.startTime).toLocaleDateString();
            const div = document.createElement('div');
            div.className = 'history-item';
            div.onclick = (e) => {
                if (!e.target.closest('.delete-history-btn')) {
                    this.renderHistoryDetail(log.startTime);
                }
            };

            // Calculate total volume or just show routine name
            const totalSets = log.logs.length;

            div.innerHTML = `
                <div class="history-item-header">
                    <strong>${log.routineName}</strong>
                    <div class="history-actions">
                        <span class="history-date">${date}</span>
                        <button class="btn-icon delete-history-btn" onclick="app.deleteHistoryItem('${log.startTime}', event)">
                            <ion-icon name="trash-outline"></ion-icon>
                        </button>
                    </div>
                </div>
                <p style="font-size:0.9rem; color:var(--text-secondary)">Sets completados: ${totalSets}</p>
            `;
            container.appendChild(div);
        });
    },

    renderHistoryDetail: function (startTime) {
        const log = this.state.history.find(h => h.startTime === startTime);
        if (!log) return;

        const container = document.getElementById('history-detail-content');
        document.getElementById('history-detail-title').innerText = log.routineName;
        container.innerHTML = '';

        // Group logs by exercise
        const exercises = {};
        log.logs.forEach(set => {
            if (!exercises[set.exercise]) {
                exercises[set.exercise] = [];
            }
            exercises[set.exercise].push(set);
        });

        for (const [exerciseName, sets] of Object.entries(exercises)) {
            const group = document.createElement('div');
            group.className = 'detail-exercise-group';

            let setsHTML = '';
            sets.forEach((set, index) => {
                setsHTML += `
                    <div class="detail-set-row">
                        <span class="detail-set-num">Serie ${index + 1}</span>
                        <span class="detail-set-data">${set.weight}kg x ${set.reps} reps</span>
                    </div>
                `;
            });

            group.innerHTML = `
                <h4>${exerciseName}</h4>
                <div class="detail-sets-list">
                    ${setsHTML}
                </div>
            `;
            container.appendChild(group);
        }

        this.navigate('history-detail-view');
    },

    toggleHistoryView: function (view) {
        this.state.historyView = view;
        document.getElementById('history-list').classList.toggle('hidden', view !== 'list');
        document.getElementById('history-calendar-view').classList.toggle('hidden', view !== 'calendar');

        document.getElementById('btn-history-list').classList.toggle('active', view === 'list');
        document.getElementById('btn-history-calendar').classList.toggle('active', view === 'calendar');

        if (view === 'calendar') {
            this.renderCalendar();
        } else {
            this.renderHistory();
        }
    },

    changeCalendarMonth: function (delta) {
        const date = new Date(this.state.calendarDate);
        date.setMonth(date.getMonth() + delta);
        this.state.calendarDate = date;
        this.renderCalendar();
    },

    renderCalendar: function () {
        const container = document.getElementById('calendar-days-grid');
        const monthYearLabel = document.getElementById('calendar-month-year');
        if (!container || !monthYearLabel) return;

        container.innerHTML = '';

        const date = this.state.calendarDate;
        const year = date.getFullYear();
        const month = date.getMonth();

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];
        monthYearLabel.innerText = `${monthNames[month]} ${year}`;

        // First day of the month
        const firstDay = new Date(year, month, 1).getDay();
        // Number of days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Previous month padding
        for (let i = 0; i < firstDay; i++) {
            const div = document.createElement('div');
            div.className = 'calendar-day empty';
            container.appendChild(div);
        }

        // Days of the month
        const today = new Date();
        const trainingDays = new Set();
        this.state.history.forEach(log => {
            const logDate = new Date(log.startTime);
            if (logDate.getFullYear() === year && logDate.getMonth() === month) {
                trainingDays.add(logDate.getDate());
            }
        });

        for (let day = 1; day <= daysInMonth; day++) {
            const div = document.createElement('div');
            div.className = 'calendar-day';
            div.innerText = day;

            if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                div.classList.add('today');
            }

            if (trainingDays.has(day)) {
                div.classList.add('has-workout');
                div.onclick = () => {
                    this.showHistoryForDay(year, month, day);
                };
            }

            container.appendChild(div);
        }
    },

    showHistoryForDay: function (year, month, day) {
        // Find workouts on this specific day
        const dayWorkouts = this.state.history.filter(log => {
            const logDate = new Date(log.startTime);
            return logDate.getFullYear() === year &&
                logDate.getMonth() === month &&
                logDate.getDate() === day;
        });

        if (dayWorkouts.length === 0) return;

        if (dayWorkouts.length === 1) {
            // Only one workout, show details immediately
            this.renderHistoryDetail(dayWorkouts[0].startTime);
        } else {
            // Multiple workouts, switch to list view (future: could filter list view)
            this.state.historyView = 'list';
            this.toggleHistoryView('list');
            // A simple alert for now to let user know they can see them in the list
            alert(`Hubo ${dayWorkouts.length} entrenamientos este día. Míralos en la lista.`);
        }
    },

    exportData: function () {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.history));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "gym_tracker_history.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    triggerImport: function () {
        document.getElementById('import-json-input').click();
    },

    importData: function (event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedHistory = JSON.parse(e.target.result);

                if (!Array.isArray(importedHistory)) {
                    throw new Error("El formato del JSON no es válido (debe ser un array).");
                }

                // Simple validation: check if first item has expected keys
                if (importedHistory.length > 0) {
                    const first = importedHistory[0];
                    if (!first.routineName || !first.logs) {
                        throw new Error("El formato del JSON no coincide con el historial de GymTracker.");
                    }
                }

                // Merge history (avoiding exact duplicates based on startTime)
                const existingStartTimes = new Set(this.state.history.map(h => h.startTime));
                const newLogs = importedHistory.filter(h => !existingStartTimes.has(h.startTime));

                if (newLogs.length === 0) {
                    alert("No se encontraron nuevos entrenamientos para importar.");
                    return;
                }

                this.state.history = [...newLogs, ...this.state.history];
                await this.saveData();
                this.renderHistory();
                alert(`¡Éxito! Se importaron ${newLogs.length} entrenamientos.`);

                // Reset input
                event.target.value = '';
            } catch (error) {
                console.error("Import Error:", error);
                alert("Error al importar el archivo: " + error.message);
            }
        };
        reader.readAsText(file);
    }
};

// Start
app.init();
