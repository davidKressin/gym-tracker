/**
 * GymTracker App Logic
 * Single Page Application structure
 */

const app = {
    // STATE
    state: {
        routines: [],
        history: [],
        activeWorkout: null, // { routineId, currentExerciseIndex, currentSet, logs: [] }
        timerInterval: null,
        timerSeconds: 0
    },

    // INIT
    init: function () {
        this.loadData();
        this.renderRoutines();
        this.renderHistory();

        // Prevent accidental back navigation on mobile
        window.history.pushState(null, null, window.location.href);
        window.onpopstate = function () {
            window.history.pushState(null, null, window.location.href);
            // Handle logical back if needed, e.g. from editor to home
        };
    },

    // NAVIGATION
    navigate: function (viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
        document.getElementById(viewId).classList.add('active-view');

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        if (viewId === 'home-view') document.querySelector('.nav-btn[onclick*="home-view"]').classList.add('active');
        if (viewId === 'history-view') document.querySelector('.nav-btn[onclick*="history-view"]').classList.add('active');

        // Clear editor if navigating there
        if (viewId === 'routine-editor-view') {
            this.setupRoutineEditor();
        }
    },

    // DATA MANAGEMENT
    loadData: function () {
        const storedRoutines = localStorage.getItem('gym_routines');
        const storedHistory = localStorage.getItem('gym_history');
        if (storedRoutines) this.state.routines = JSON.parse(storedRoutines);
        if (storedHistory) this.state.history = JSON.parse(storedHistory);
    },

    saveData: function () {
        localStorage.setItem('gym_routines', JSON.stringify(this.state.routines));
        localStorage.setItem('gym_history', JSON.stringify(this.state.history));
        this.renderRoutines(); // Refresh UI
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

    addExerciseInput: function () {
        const container = document.getElementById('exercises-list-editor');
        const count = container.children.length + 1;
        const div = document.createElement('div');
        div.className = 'exercise-input-group';
        div.innerHTML = `
            <div style="margin-bottom:10px;">
                <label>Nombre Ejercicio</label>
                <input type="text" class="ex-name" placeholder="Ej. Squat">
            </div>
            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label>Series</label>
                    <input type="number" class="ex-sets" value="3">
                </div>
                <div style="flex:1;">
                    <label>Descanso (seg)</label>
                    <input type="number" class="ex-rest" value="60">
                </div>
            </div>
            ${count > 1 ? '<button class="btn-delete-ex" onclick="this.parentElement.remove()"><ion-icon name="trash-outline"></ion-icon></button>' : ''}
        `;
        container.appendChild(div);
    },

    saveRoutine: function () {
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

        const newRoutine = {
            id: Date.now().toString(),
            name,
            exercises
        };

        this.state.routines.push(newRoutine);
        this.saveData();
        this.navigate('home-view');
    },

    deleteRoutine: function (id) {
        if (confirm('¿Borrar esta rutina?')) {
            this.state.routines = this.state.routines.filter(r => r.id !== id);
            this.saveData();
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

        this.updateWorkoutUI(routine);
        this.navigate('workout-view');
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

        // Reset inputs for convenience or keep prev if helpful? Let's reset.
        // Or better: try to auto-fill with prev set if available
        document.getElementById('weight-input').value = '';
        // document.getElementById('reps-input').value = ''; // Let's leave reps empty or default to something? default 0
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

    finishWorkout: function () {
        this.state.activeWorkout.endTime = new Date().toISOString();
        this.state.history.unshift(this.state.activeWorkout);
        this.saveData(); // Save history
        this.state.activeWorkout = null;
        alert('Entrenamiento Terminado! 💪');
        this.renderHistory();
        this.navigate('history-view');
    },

    confirmExitWorkout: function () {
        if (confirm('¿Salir del entrenamiento actual? Se perderá el progreso no guardado.')) {
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

            // Calculate total volume or just show routine name
            const totalSets = log.logs.length;

            div.innerHTML = `
                <div class="history-item-header">
                    <strong>${log.routineName}</strong>
                    <span class="history-date">${date}</span>
                </div>
                <p style="font-size:0.9rem; color:var(--text-secondary)">Sets completados: ${totalSets}</p>
            `;
            container.appendChild(div);
        });
    },

    exportData: function () {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.history));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "gym_tracker_history.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
};

// Start
app.init();
