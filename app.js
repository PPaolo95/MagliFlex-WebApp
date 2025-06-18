// Global state for tracking current item being edited
let currentEditingId = {
    phases: null,
    machines: null,
    departments: null,
    rawMaterials: null,
    articles: null,
    planning: null
};

// Global variable to store the current logged-in user
let currentUser = null;

// Gestione dati dell'applicazione
let appData = {
    phases: [], 
    machines: [],
    departments: [], 
    rawMaterials: [], 
    warehouseJournal: [], 
    articles: [],
    productionPlan: [],
    notifications: [], 
    currentDeliveryWeekStartDate: null,
    currentWorkloadWeekStartDate: null
};

// Variabile globale per la pianificazione corrente calcolata ma non ancora salvata
let currentCalculatedPlanningDetails = null;

// Global variable to store the journal entry ID for the consumption modal
let currentModalJournalEntryId = null;

// Global variable to store the currently active notification filter ('unread' or 'all')
let currentNotificationFilter = 'unread';

// Inizializzazione: Carica i dati salvati e aggiorna l'UI quando il DOM è pronto
document.addEventListener('DOMContentLoaded', function() {
    // Check for existing login
    const savedUser = localStorage.getItem('magliflex-currentUser');
    if (savedUser) {
        currentUser = savedUser;
        document.getElementById('loginOverlay').classList.remove('show');
        document.getElementById('appContent').style.display = 'block';
        loadAndInitializeAppData();
        showNotification(`Bentornato, ${currentUser}!`, 'info');
    } else {
        document.getElementById('loginOverlay').classList.add('show');
        document.getElementById('appContent').style.display = 'none';
    }

    // Set up barcode input listener
    document.getElementById('rawMaterialBarcode').addEventListener('keyup', handleBarcodeInput);

    // Event listeners for the actual consumption modal
    document.getElementById('confirmActualConsumptionBtn').addEventListener('click', confirmActualConsumption);
    document.getElementById('cancelActualConsumptionBtn').addEventListener('click', () => {
        document.getElementById('actualConsumptionModal').classList.remove('show');
        currentModalJournalEntryId = null; // Clear the stored ID
    });

    // Event listeners for the edit planning modal
    document.getElementById('saveEditedPlanningBtn').addEventListener('click', saveEditedPlanning);
    document.getElementById('cancelEditPlanningBtn').addEventListener('click', () => {
        document.getElementById('editPlanningModal').classList.remove('show');
        currentEditingId.planning = null; // Clear the stored ID
        currentCalculatedPlanningDetails = null; // Clear calculated details
    });

    // Event listener for import data file input
    document.getElementById('importDataFile').addEventListener('change', importDataFromJson);

    // Event listener for username input to allow Enter key for login
    document.getElementById('usernameInput').addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            loginUser();
        }
    });

    // Event listener to close the menu if clicking outside
    document.addEventListener('click', function(event) {
        const mainNavMenu = document.getElementById('mainNavMenu');
        const hamburgerBtn = document.querySelector('.hamburger-btn');
        if (mainNavMenu.classList.contains('open') && !mainNavMenu.contains(event.target) && !hamburgerBtn.contains(event.target)) {
            toggleNavMenu(); // Close the menu if click is outside of it or the hamburger button
        }
    });
});

/**
 * Carica i dati dell'applicazione da localStorage o usa i valori predefiniti.
 * Questa funzione viene chiamata dopo il login.
 */
function loadAndInitializeAppData() {
    const saved = localStorage.getItem('magliflex-data');
    if (saved) {
        try {
            const loadedData = JSON.parse(saved);
            
            // Merge default anagraphics with loaded data
            appData.phases = mergeData(getInitialPhases(), loadedData.phases);
            appData.machines = mergeData(getInitialMachines(), loadedData.machines);
            appData.departments = loadedData.departments || getInitialDepartments();
            appData.rawMaterials = loadedData.rawMaterials || [];
            appData.warehouseJournal = loadedData.warehouseJournal || [];
            appData.articles = loadedData.articles || [];
            appData.productionPlan = loadedData.productionPlan || [];
            appData.notifications = loadedData.notifications || [];

            // Convert date strings back to Date objects
            appData.currentDeliveryWeekStartDate = loadedData.currentDeliveryWeekStartDate ? new Date(loadedData.currentDeliveryWeekStartDate) : getStartOfWeek(new Date());
            appData.currentWorkloadWeekStartDate = loadedData.currentWorkloadWeekStartDate ? new Date(loadedData.currentWorkloadWeekStartDate) : getStartOfWeek(new Date());
            
            // Ensure dates within productionPlan and warehouseJournal are Date objects
            appData.productionPlan.forEach(plan => {
                if (typeof plan.startDate === 'string') plan.startDate = new Date(plan.startDate);
                if (typeof plan.estimatedDeliveryDate === 'string') plan.estimatedDeliveryDate = new Date(plan.estimatedDeliveryDate);
            });
            appData.warehouseJournal.forEach(entry => {
                if (typeof entry.date === 'string') entry.date = new Date(entry.date);
            });

            if (appData.articles.length === 0 && appData.productionPlan.length === 0 && appData.rawMaterials.length === 0) {
                addExampleData();
            } else {
                ensureInitialAnagraphics();
            }
        } catch (e) {
            console.error('Errore nel caricamento dati dal localStorage:', e);
            showNotification('Errore nel caricamento dei dati salvati. Dati potrebbero essere corrotti. Vengono usati i dati predefiniti e di esempio.', 'error');
            resetAppDataToDefaultsAndAddExamples();
        }
    } else {
        showNotification('Nessun dato salvato trovato. Vengono usati i dati predefiniti e di esempio. Inizia a inserire le tue informazioni.', 'info');
        resetAppDataToDefaultsAndAddExamples();
    }
    
    updateAllTables();
    document.getElementById('rawMaterialLoadDate').valueAsDate = new Date();
    document.getElementById('planningStartDate').valueAsDate = new Date();
    showPage('phases'); 
}

/**
 * Assicura che le anagrafiche iniziali (fasi, macchinari, reparti predefiniti) siano presenti.
 * Utile per aggiornamenti o caricamenti parziali da localStorage.
 */
function ensureInitialAnagraphics() {
    appData.phases = mergeData(getInitialPhases(), appData.phases);
    appData.machines = mergeData(getInitialMachines(), appData.machines);
    if (appData.departments.length === 0) {
        appData.departments = getInitialDepartments();
    } else {
        appData.departments = mergeData(getInitialDepartments(), appData.departments); // Merge existing with new defaults
    }
    if (appData.rawMaterials.length === 0) {
        appData.rawMaterials = getInitialRawMaterials();
        appData.rawMaterials.forEach(rm => addJournalEntry(rm.id, 'Carico', rm.currentStock, null, false, null, new Date().toISOString())); // Initial load date
    } else {
        // Also ensure barcodes are added to existing if they weren't before
        const initialRawMaterials = getInitialRawMaterials();
        initialRawMaterials.forEach(initialRm => {
            const existingRm = appData.rawMaterials.find(rm => rm.id === initialRm.id);
            if (existingRm && !existingRm.barcode && initialRm.barcode) {
                existingRm.barcode = initialRm.barcode;
            }
        });
        appData.rawMaterials = mergeData(initialRawMaterials, appData.rawMaterials); // Merge existing with new defaults
    }
    saveData();
}


/**
 * Restituisce le fasi iniziali predefinite.
 */
function getInitialPhases() {
    return [
        { id: 101, name: "Preparazione Filati", time: 5 },
        { id: 102, name: "Tessitura", time: 60 },
        { id: 103, name: "Rammaglio", time: 45 },
        { id: 104, name: "Cucitura", time: 20 },
        { id: 105, name: "Controllo Qualità", time: 10 },
        { id: 106, name: "Rifinitura e Stiro", time: 15 },
        { id: 107, name: "Etichettatura e Confezionamento", time: 5 }
    ];
}

/**
 * Restituisce i macchinari iniziali predefiniti.
 */
function getInitialMachines() {
    return [
        { id: 201, name: "Rettilinea F3 (A)", type: "Rettilinea", fineness: 3, capacity: 8, currentLoad: 0 },
        { id: 202, name: "Rettilinea F3 (B)", type: "Rettilinea", fineness: 3, capacity: 8, currentLoad: 0 },
        { id: 203, name: "Rettilinea F5 (A)", type: "Rettilinea", fineness: 5, capacity: 15, currentLoad: 0 },
        { id: 204, name: "Rettilinea F5 (B)", type: "Rettilinea", fineness: 5, capacity: 15, currentLoad: 0 },
        { id: 205, name: "Rettilinea F7 (A)", type: "Rettilinea", fineness: 7, capacity: 25, currentLoad: 0 },
        { id: 206, name: "Rettilinea F7 (B)", type: "Rettilinea", fineness: 7, capacity: 25, currentLoad: 0 },
        { id: 207, name: "Rettilinea F7 (C)", type: "Rettilinea", fineness: 7, capacity: 25, currentLoad: 0 },
        { id: 208, name: "Rettilinea F12 (A)", type: "Rettilinea", fineness: 12, capacity: 35, currentLoad: 0 },
        { id: 209, name: "Rettilinea F12 (B)", type: "Rettilinea", fineness: 12, capacity: 35, currentLoad: 0 },
        { id: 210, name: "Rettilinea F12 (C)", type: "Rettilinea", fineness: 12, capacity: 35, currentLoad: 0 },
        { id: 211, name: "Rettilinea F12 (D)", type: "Rettilinea", fineness: 12, capacity: 35, currentLoad: 0 },
        { id: 212, name: "Rettilinea F12 (E)", type: "Rettilinea", fineness: 12, capacity: 35, currentLoad: 0 },
        { id: 213, name: "Rettilinea F12 (F)", type: "Rettilinea", fineness: 12, capacity: 35, currentLoad: 0 },
        { id: 214, name: "Rettilinea F12 (G)", type: "Rettilinea", fineness: 12, capacity: 35, currentLoad: 0 },
        { id: 215, name: "Rettilinea F14 (A)", type: "Rettilinea", fineness: 14, capacity: 40, currentLoad: 0 },
        { id: 216, name: "Rettilinea F14 (B)", type: "Rettilinea", fineness: 14, capacity: 40, currentLoad: 0 },
        { id: 217, name: "Rettilinea F14 (C)", type: "Rettilinea", fineness: 14, capacity: 40, currentLoad: 0 },
        { id: 218, name: "Integrale F7 (Unica)", type: "Integrale", fineness: 7, capacity: 12, currentLoad: 0 },
        { id: 900, name: "Operazioni Manuali (Generico)", type: "Manuale", fineness: 0, capacity: 9999, currentLoad: 0 }
    ];
}

/**
 * Restituisce i dipartimenti iniziali predefiniti.
 */
function getInitialDepartments() {
    return [
        { id: 301, name: "Tessitura Rettilinea", machineTypes: ["Rettilinea"], finenesses: [3, 5, 7, 12, 14], phaseIds: [102] },
        { id: 302, name: "Tessitura Integrale", machineTypes: ["Integrale"], finenesses: [7], phaseIds: [102] },
        { id: 303, name: "Finitura & Qualità", machineTypes: ["Manuale"], finenesses: [0], phaseIds: [101, 103, 104, 105, 106, 107] }
    ];
}

/**
 * Restituisce le materie prime iniziali predefinite.
 */
function getInitialRawMaterials() {
    return [
        { id: 501, name: "Cotone Biologico", unit: "kg", currentStock: 500, barcode: "RM001COTTON" },
        { id: 502, name: "Lana Merino Fine", unit: "kg", currentStock: 300, barcode: "RM002WOOL" },
        { id: 503, name: "Etichette Personalizzate", unit: "pz", currentStock: 1000, barcode: "RM003LABEL" }
    ];
}

/**
 * Resetta appData ai suoi valori predefiniti e aggiunge i dati di esempio.
 */
function resetAppDataToDefaultsAndAddExamples() {
    appData = {
        phases: getInitialPhases(),
        machines: getInitialMachines(),
        departments: getInitialDepartments(),
        rawMaterials: getInitialRawMaterials(), 
        warehouseJournal: [], 
        articles: [],
        productionPlan: [],
        notifications: [], 
        currentDeliveryWeekStartDate: getStartOfWeek(new Date()),
        currentWorkloadWeekStartDate: getStartOfWeek(new Date())
    };
    appData.rawMaterials.forEach(rm => addJournalEntry(rm.id, 'Carico', rm.currentStock, null, false, null, new Date().toISOString()));

    addExampleData();
}

/**
 * Aggiunge dati di esempio (articoli e pianificazioni) se l'app è vuota.
 */
function addExampleData() {
    // Define example articles (using fixed IDs for consistency)
    const exampleArticles = [
        {
            id: 1001, 
            code: 'MAG_UOMO_001',
            description: 'Maglione basic in cotone',
            color: 'Grigio Melange',
            client: 'Retail Moda SpA',
            cycle: [
                { phaseId: 102, machineType: 'Rettilinea', fineness: 12 }, 
                { phaseId: 103, machineType: 'Manuale', fineness: 0 }, 
                { phaseId: 104, machineType: 'Manuale', fineness: 0 }, 
                { phaseId: 105, machineType: 'Manuale', fineness: 0 }, 
                { phaseId: 106, machineType: 'Manuale', fineness: 0 }, 
                { phaseId: 107, machineType: 'Manuale', fineness: 0 }  
            ],
            bom: [ 
                { rawMaterialId: 501, quantityPerPiece: 0.5 }, 
                { rawMaterialId: 503, quantityPerPiece: 2 }    
            ]
        },
        {
            id: 1002,
            code: 'ABITO_DONNA_002',
            description: 'Abito in maglia integrale',
            color: 'Nero',
            client: 'Elegance S.r.l.',
            cycle: [
                { phaseId: 102, machineType: 'Integrale', fineness: 7 }, 
                { phaseId: 105, machineType: 'Manuale', fineness: 0 }, 
                { phaseId: 106, machineType: 'Manuale', fineness: 0 }, 
                { phaseId: 107, machineType: 'Manuale', fineness: 0 }  
            ],
            bom: [
                { rawMaterialId: 502, quantityPerPiece: 0.8 }, 
                { rawMaterialId: 503, quantityPerPiece: 3 }    
            ]
        },
        {
            id: 1003,
            code: 'SCIA_LANA_003',
            description: 'Sciarpa in lana grossa',
            color: 'Rosso',
            client: 'Moda Invernale S.p.A.',
            cycle: [
                { phaseId: 102, machineType: 'Rettilinea', fineness: 3 }, 
                { phaseId: 103, machineType: 'Manuale', fineness: 0 }, 
                { phaseId: 106, machineType: 'Manuale', fineness: 0 }  
            ],
            bom: [
                { rawMaterialId: 502, quantityPerPiece: 0.3 }, 
                { rawMaterialId: 503, quantityPerPiece: 1 }    
            ]
        }
    ];

    appData.articles.push(...exampleArticles); 

    const today = new Date();
    today.setHours(0,0,0,0);

    const plansToDeduct = [];

    const plan1Details = calculateDeliveryDetails(1001, 200, 'high', 'Urgente per sfilata', 'production', today.toISOString().split('T')[0]);
    if (plan1Details) {
        plan1Details.id = 2001; 
        appData.productionPlan.push(plan1Details);
        plansToDeduct.push(plan1Details);
    }

    const startDate2 = addWorkingDays(new Date(today.getTime()), 5);
    const plan2Details = calculateDeliveryDetails(1002, 50, 'medium', 'Collezione Primavera', 'sampling', startDate2.toISOString().split('T')[0]);
    if (plan2Details) {
        plan2Details.id = 2002;
        appData.productionPlan.push(plan2Details);
        plansToDeduct.push(plan2Details);
    }

    const startDate3 = addWorkingDays(new Date(today.getTime()), 10);
    const plan3Details = calculateDeliveryDetails(1003, 500, 'low', 'Stock magazzino', 'production', startDate3.toISOString().split('T')[0]);
    if (plan3Details) {
        plan3Details.id = 2003;
        appData.productionPlan.push(plan3Details);
        plansToDeduct.push(plan3Details);
    }

    // Deduct raw materials for example plans *after* all plans are added to avoid ID issues
    plansToDeduct.forEach(plan => {
        deductRawMaterialsForPlan(plan);
    });

    saveData(); 
}


/**
 * Funzione di utility per unire i dati predefiniti con quelli caricati da localStorage.
 * Se un elemento con lo stesso ID esiste sia nei dati predefiniti che in quelli caricati,
 * viene usata la versione caricata (preservando le modifiche dell'utente).
 * Nuovi elementi dai dati caricati vengono aggiunti.
 * @param {Array} defaultArray L'array di dati predefiniti.
 * @param {Array} loadedArray L'array di dati caricati da localStorage.
 * @returns {Array} L'array combinato.
 */
function mergeData(defaultArray, loadedArray) {
    if (!loadedArray) return defaultArray;

    const mergedMap = new Map();
    defaultArray.forEach(item => mergedMap.set(item.id, item));
    loadedArray.forEach(item => mergedMap.set(item.id, item));
    
    return Array.from(mergedMap.values());
}

/**
 * Restituisce l'inizio della settimana (Lunedì) per una data data.
 * @param {Date} date La data di riferimento.
 * @returns {Date} La data del lunedì della settimana.
 */
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // Domenica = 0, Lunedì = 1, ..., Sabato = 6
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday (0) to become Monday of prev week
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Salva i dati correnti dell'applicazione nell'localStorage.
 * Logga un errore se il salvataggio fallisce.
 */
function saveData() {
    try {
        localStorage.setItem('magliflex-data', JSON.stringify(appData));
    } catch (e) {
        console.error('Errore nel salvataggio dati nel localStorage:', e);
        showNotification('Errore nel salvataggio dei dati. Spazio insufficiente o errore browser.', 'error');
    }
}

/**
 * Aggiorna tutte le tabelle e le liste nell'interfaccia utente.
 */
function updateAllTables() {
    updatePhasesTable();
    updateMachinesTable();
    updateDepartmentsTable();
    updateRawMaterialsStockTable();
    updateWarehouseJournalTable();
    updateRawMaterialSelectOptions(); 
    updateDepartmentSelectOptions(); 
    updateDepartmentPhaseSelectOptions(); 
    updateArticleSelectOptions(); 
    updateArticlesTable();
    updatePlanningList();
    updatePlanningLotSelectOptions();
    updateDeliveryCalendar();
    updateDailyWorkloadCalendar();
    updateDashboard();
    updateNotificationBadge(); // Update badge on every UI refresh
}

/**
 * Gestisce la navigazione tra le pagine dell'applicazione.
 * Rende visibile solo la pagina selezionata e imposta il bottone di navigazione come attivo.
 * @param {string} pageId L'ID della pagina da mostrare.
 */
function showPage(pageId) {
    // Only proceed if a user is logged in
    if (!currentUser) {
        showNotification('Devi effettuare il login per accedere alle pagine.', 'warning');
        return;
    }

    const pages = document.querySelectorAll('.page');
    const navBtns = document.querySelectorAll('#mainNavMenu .nav-btn'); // Select buttons specifically in the main nav menu
    
    pages.forEach(p => p.classList.remove('active'));
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(pageId).classList.add('active');
    // Find the correct nav button within the mainNavMenu
    document.querySelector(`#mainNavMenu .nav-btn[onclick="showPage('${pageId}')"]`).classList.add('active');
    
    // Close the navigation menu when a page is selected (for mobile)
    const mainNavMenu = document.getElementById('mainNavMenu');
    const hamburgerBtn = document.querySelector('.hamburger-btn');
    if (mainNavMenu.classList.contains('open')) {
        mainNavMenu.classList.remove('open');
        hamburgerBtn.classList.remove('open');
    }

    // Aggiorna le sezioni specifiche quando si naviga alla pagina
    if (pageId === 'schedule') {
        updateDeliveryCalendar();
        updateDailyWorkloadCalendar();
    }
    if (pageId === 'dashboard') updateDashboard();
    if (pageId === 'planning') {
        updatePlanningOptions(); 
        updateArticleSelectOptions(); // Ensure article options are fresh
        updatePlanningLotSelectOptions();
        cancelEdit('planning'); // Clear form and reset editing state
    }
    if (pageId === 'departments') {
        updateDepartmentsTable();
        updateDepartmentSelectOptions();
        updateDepartmentPhaseSelectOptions();
        cancelEdit('departments'); // Clear form and reset editing state
    }
    if (pageId === 'rawMaterials') { 
        updateRawMaterialsStockTable();
        updateWarehouseJournalTable();
        updateRawMaterialSelectOptions(); 
        cancelEdit('rawMaterials'); // Clear form and reset editing state
        document.getElementById('rawMaterialLoadDate').valueAsDate = new Date(); // Reset load date
        document.getElementById('rawMaterialBarcode').value = ''; // Clear barcode input
    }
    if (pageId === 'phases') {
        updatePhasesTable();
        cancelEdit('phases');
    }
    if (pageId === 'machines') {
        updateMachinesTable();
        cancelEdit('machines');
    }
    if (pageId === 'articles') {
        updateArticlesTable();
        updateRawMaterialSelectOptions(); // Ensure raw material select for BOM is updated
        updatePlanningOptions(); // ensure article list for planning is updated
        cancelEdit('articles'); // Clear form and reset editing state
    }
}

/**
 * Toggles the visibility of the main navigation menu (hamburger menu).
 */
function toggleNavMenu() {
    const mainNavMenu = document.getElementById('mainNavMenu');
    const hamburgerBtn = document.querySelector('.hamburger-btn');
    mainNavMenu.classList.toggle('open');
    hamburgerBtn.classList.toggle('open');
}


/**
 * Gestione Notifiche
 * Aggiunge un messaggio al sistema di notifica persistente.
 * @param {string} message Il messaggio da visualizzare.
 * @param {string} type Il tipo di notifica ('success', 'error', 'info', 'warning').
 */
function showNotification(message, type = 'info') {
    const newNotification = {
        id: Date.now() + Math.random(),
        message: message,
        type: type,
        isRead: false,
        timestamp: new Date().toISOString()
    };
    appData.notifications.push(newNotification);
    saveData();
    updateNotificationBadge();
}

/**
 * Aggiorna il badge numerico sul pulsante "Messaggi Importanti".
 */
function updateNotificationBadge() {
    const unreadCount = appData.notifications.filter(n => !n.isRead).length;
    const badge = document.getElementById('notificationBadge');
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

/**
 * Apre il modale delle notifiche.
 */
function openNotificationsModal() {
    document.getElementById('notificationsModal').classList.add('show');
    renderNotifications();
}

/**
 * Chiude il modale delle notifiche.
 */
function closeNotificationsModal() {
    document.getElementById('notificationsModal').classList.remove('show');
}

/**
 * Filtra e renderizza le notifiche nel modale.
 * @param {string} filter 'unread' o 'all'
 */
function filterNotifications(filter) {
    currentNotificationFilter = filter;
    document.getElementById('filterUnread').classList.remove('active');
    document.getElementById('filterAll').classList.remove('active');
    document.getElementById(`filter${capitalizeFirstLetter(filter)}`).classList.add('active');
    renderNotifications();
}

/**
 * Renderizza le notifiche nel modale in base al filtro corrente.
 */
function renderNotifications() {
    const listDiv = document.getElementById('notificationsList');
    listDiv.innerHTML = '';

    const filteredNotifications = appData.notifications
        .filter(n => currentNotificationFilter === 'all' || !n.isRead)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Most recent first

    if (filteredNotifications.length === 0) {
        listDiv.innerHTML = '<p style="text-align: center; color: #888;">Nessun messaggio da visualizzare.</p>';
        return;
    }

    filteredNotifications.forEach(n => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `notification-item ${n.type}`;
        itemDiv.innerHTML = `
            <div class="notification-item-content">
                <strong>${n.message}</strong>
                <small>${new Date(n.timestamp).toLocaleString('it-IT')}</small>
            </div>
            <button onclick="markNotificationRead(${n.id})">Sana</button>
        `;
        listDiv.appendChild(itemDiv);
    });
}

/**
 * Marca una notifica come letta.
 * @param {number} id L'ID della notifica da marcare.
 */
function markNotificationRead(id) {
    const notification = appData.notifications.find(n => n.id === id);
    if (notification) {
        notification.isRead = true;
        saveData();
        renderNotifications(); // Re-render to update the list
        updateNotificationBadge(); // Update the badge
    }
}

// --- EDITING UTILITIES ---

/**
 * Resets a form and hides/shows relevant buttons based on editing state.
 * @param {string} entityType The type of entity being edited ('phases', 'machines', etc.).
 */
function cancelEdit(entityType) {
    currentEditingId[entityType] = null;
    const saveBtn = document.getElementById(`save${capitalizeFirstLetter(entityType)}Btn`);
    const cancelBtn = document.getElementById(`cancel${capitalizeFirstLetter(entityType)}Btn`);

    if (saveBtn) saveBtn.textContent = `Aggiungi ${capitalizeFirstLetter(entityType).slice(0, -1)}`; // e.g., "Add Phase"
    if (cancelBtn) cancelBtn.style.display = 'none';

    // Specific resets for each entity type
    switch(entityType) {
        case 'phases':
            document.getElementById('phaseName').value = '';
            document.getElementById('phaseTime').value = '';
            break;
        case 'machines':
            document.getElementById('machineName').value = '';
            document.getElementById('machineCapacity').value = '';
            break;
        case 'departments':
            document.getElementById('departmentId').value = 'new';
            document.getElementById('departmentName').value = '';
            document.getElementById('departmentMachineTypes').value = '';
            document.getElementById('departmentFinenesses').value = '';
            // Clear all selected options in multi-select
            Array.from(document.getElementById('departmentPhaseIds').options).forEach(option => option.selected = false);
            break;
        case 'rawMaterials':
            document.getElementById('rawMaterialSelect').value = 'new';
            document.getElementById('newRawMaterialName').value = '';
            document.getElementById('rawMaterialUnit').value = '';
            document.getElementById('rawMaterialQuantity').value = '';
            document.getElementById('rawMaterialLoadDate').valueAsDate = new Date(); // Reset to today
            document.getElementById('rawMaterialBarcode').value = ''; // Clear barcode input
            // Explicitly set visibility based on 'new' value here
            document.getElementById('newRawMaterialNameGroup').style.display = 'block';
            document.getElementById('saveRawMaterialBtn').textContent = 'Aggiungi Materia Prima';
            document.getElementById('cancelRawMaterialBtn').style.display = 'none';
            break;
        case 'articles':
            document.getElementById('articleId').value = 'new';
            document.getElementById('articleCode').value = '';
            document.getElementById('articleDescription').value = '';
            document.getElementById('articleColor').value = '';
            document.getElementById('articleClient').value = '';
            document.getElementById('cycleSteps').innerHTML = '';
            document.getElementById('bomItems').innerHTML = '';
            break;
        case 'planning':
            document.getElementById('planningLotId').value = 'new';
            document.getElementById('planningArticle').value = '';
            document.getElementById('planningQuantity').value = '';
            document.getElementById('planningType').value = 'production'; // Default to production
            document.getElementById('planningPriority').value = 'medium';
            document.getElementById('planningNotes').value = '';
            document.getElementById('planningStartDate').valueAsDate = new Date();
            document.getElementById('deliveryResult').innerHTML = '<p>Seleziona un articolo e una quantità per calcolare la data di consegna stimata.</p>';
            break;
    }
}

/**
 * Helper to capitalize the first letter of a string.
 * @param {string} string The input string.
 * @returns {string} The capitalized string.
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}


// --- GESTIONE FASI ---

/**
 * Handles adding a new phase or updating an existing one.
 */
function addPhase() {
    const name = document.getElementById('phaseName').value.trim();
    const time = parseInt(document.getElementById('phaseTime').value);
    
    if (!name || isNaN(time) || time <= 0) {
        showNotification('Inserisci un nome fase e un tempo di lavorazione valido (maggiore di 0).', 'error');
        return;
    }
    
    if (currentEditingId.phases) {
        // Update existing phase
        const phaseToUpdate = appData.phases.find(p => p.id === currentEditingId.phases);
        if (phaseToUpdate) {
            // Check if name changed to an existing one (excluding itself)
            if (appData.phases.some(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== currentEditingId.phases)) {
                showNotification('Una fase con questo nome esiste già.', 'error');
                return;
            }
            phaseToUpdate.name = name;
            phaseToUpdate.time = time;
            showNotification('Fase aggiornata con successo!', 'success');
        } else {
            showNotification('Fase da aggiornare non trovata.', 'error');
        }
    } else {
        // Add new phase
        if (appData.phases.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            showNotification('Una fase con questo nome esiste già.', 'error');
            return;
        }
        const phase = { id: Date.now(), name: name, time: time };
        appData.phases.push(phase);
        showNotification('Fase aggiunta con successo!', 'success');
    }
    
    saveData();
    cancelEdit('phases');
    updateAllTables(); // Explicitly call update after data change
}

/**
 * Populates the form with data of the phase to be edited.
 * @param {number} id The ID of the phase to edit.
 */
function editPhase(id) {
    const phase = appData.phases.find(p => p.id === id);
    if (phase) {
        currentEditingId.phases = id;
        document.getElementById('phaseName').value = phase.name;
        document.getElementById('phaseTime').value = phase.time;
        document.getElementById('savePhaseBtn').textContent = 'Salva Modifiche';
        document.getElementById('cancelPhaseBtn').style.display = 'inline-block';
    } else {
        showNotification('Fase non trovata per la modifica.', 'error');
    }
}

/**
 * Aggiorna la tabella delle fasi di lavorazione.
 * Popola la tabella con i dati presenti in `appData.phases`.
 */
function updatePhasesTable() {
    const tbody = document.getElementById('phasesTable');
    tbody.innerHTML = ''; 
    
    if (appData.phases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Nessuna fase aggiunta.</td></tr>';
        return;
    }

    appData.phases.forEach(phase => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${phase.name}</td>
            <td>${phase.time}</td>
            <td>
                <button class="btn" onclick="editPhase(${phase.id})">Modifica</button>
                <button class="btn btn-danger" onclick="deletePhase(${phase.id})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Elimina una fase di lavorazione.
 * @param {number} id L'ID della fase da eliminare.
 */
function deletePhase(id) {
    // Check if any article cycle uses this phase
    const articlesUsingPhase = appData.articles.filter(article => 
        article.cycle && article.cycle.some(step => step.phaseId === id)
    );
    if (articlesUsingPhase.length > 0) {
        const articleCodes = articlesUsingPhase.map(a => a.code).join(', ');
        showNotification(`Impossibile eliminare: Fase utilizzata nel ciclo di articoli: ${articleCodes}.`, 'error');
        return;
    }
     // Check if any department uses this phase
    const departmentsUsingPhase = appData.departments.filter(dept => 
        dept.phaseIds && dept.phaseIds.includes(id)
    );
    if (departmentsUsingPhase.length > 0) {
        const deptNames = departmentsUsingPhase.map(d => d.name).join(', ');
        showNotification(`Impossibile eliminare: Fase collegata ai reparti: ${deptNames}.`, 'error');
        return;
    }


    appData.phases = appData.phases.filter(phase => phase.id !== id);
    saveData();
    updateAllTables(); // Explicitly call update after data change
    showNotification('Fase eliminata con successo!', 'success');
}

// --- GESTIONE MACCHINARI ---

/**
 * Handles adding a new machine or updating an existing one.
 */
function addMachine() {
    const name = document.getElementById('machineName').value.trim();
    const capacity = parseInt(document.getElementById('machineCapacity').value);
    
    if (!name || isNaN(capacity) || capacity <= 0) {
        showNotification('Inserisci un nome macchinario e una capacità giornaliera valida (maggiore di 0).', 'error');
        return;
    }
    
    let type = "Generico"; 
    let fineness = 0; 
    if (name.toLowerCase().includes('rettilinea')) type = 'Rettilinea';
    if (name.toLowerCase().includes('integrale')) type = 'Integrale';
    const finenessMatch = name.match(/f(\d+)/i);
    if (finenessMatch && finenessMatch[1]) {
        fineness = parseInt(finenessMatch[1]);
    }

    if (currentEditingId.machines) {
        // Update existing machine
        const machineToUpdate = appData.machines.find(m => m.id === currentEditingId.machines);
        if (machineToUpdate) {
            if (appData.machines.some(m => m.name.toLowerCase() === name.toLowerCase() && m.id !== currentEditingId.machines)) {
                showNotification('Un macchinario con questo nome esiste già.', 'error');
                return;
            }
            machineToUpdate.name = name;
            machineToUpdate.capacity = capacity;
            machineToUpdate.type = type;
            machineToUpdate.fineness = fineness;
            showNotification('Macchinario aggiornato con successo!', 'success');
        } else {
            showNotification('Macchinario da aggiornare non trovato.', 'error');
        }
    } else {
        // Add new machine
        if (appData.machines.some(m => m.name.toLowerCase() === name.toLowerCase())) {
            showNotification('Un macchinario con questo nome esiste già.', 'error');
            return;
        }
        const machine = { id: Date.now(), name: name, type: type, fineness: fineness, capacity: capacity, currentLoad: 0 };
        appData.machines.push(machine);
        showNotification('Macchinario aggiunto con successo!', 'success');
    }
    
    saveData();
    cancelEdit('machines');
    updateAllTables(); // Explicitly call update after data change
}

/**
 * Populates the form with data of the machine to be edited.
 * @param {number} id The ID of the machine to edit.
 */
function editMachine(id) {
    const machine = appData.machines.find(m => m.id === id);
    if (machine) {
        currentEditingId.machines = id;
        document.getElementById('machineName').value = machine.name;
        document.getElementById('machineCapacity').value = machine.capacity;
        document.getElementById('saveMachineBtn').textContent = 'Salva Modifiche';
        document.getElementById('cancelMachineBtn').style.display = 'inline-block';
    } else {
        showNotification('Macchinario non trovato per la modifica.', 'error');
    }
}

/**
 * Aggiorna la tabella dei macchinari.
 * Popola la tabella con i dati presenti in `appData.machines`.
 */
function updateMachinesTable() {
    const tbody = document.getElementById('machinesTable');
    tbody.innerHTML = ''; 
    
    if (appData.machines.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nessun macchinario aggiunto.</td></tr>';
        return;
    }

    appData.machines.forEach(machine => {
        const utilizzo = machine.capacity > 0 ? Math.round((machine.currentLoad / machine.capacity) * 100) : 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${machine.name} (Tipo: ${machine.type}, Finezza: ${machine.fineness})</td>
            <td>${machine.capacity}</td>
            <td>
                <div class="machine-usage">
                    <div class="machine-usage-bar" style="width: ${utilizzo}%"></div>
                </div>
                ${utilizzo}%
            </td>
            <td>
                <button class="btn" onclick="editMachine(${machine.id})">Modifica</button>
                <button class="btn btn-danger" onclick="deleteMachine(${machine.id})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Elimina un macchinario.
 * @param {number} id L'ID del macchinario da eliminare.
 */
function deleteMachine(id) {
    // Check if any article cycle uses this machine type/fineness
    const articlesUsingMachine = appData.articles.filter(article => 
        article.cycle && article.cycle.some(step => {
            const machine = appData.machines.find(m => m.id === id);
            return machine && step.machineType === machine.type && step.fineness === machine.fineness;
        })
    );
    if (articlesUsingMachine.length > 0) {
        const articleCodes = articlesUsingMachine.map(a => a.code).join(', ');
        showNotification(`Impossibile eliminare: Macchinario utilizzato nel ciclo di articoli: ${articleCodes}.`, 'error');
        return;
    }

    appData.machines = appData.machines.filter(machine => machine.id !== id);
    saveData();
    updateAllTables(); // Explicitly call update after data change
    showNotification('Macchinario eliminato con successo!', 'success');
}

// --- GESTIONE REPARTI ---

/**
 * Popola il select dei reparti per la modifica.
 */
function updateDepartmentSelectOptions() {
    const select = document.getElementById('departmentId');
    select.innerHTML = '<option value="new">-- Nuovo Reparto --</option>';
    appData.departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = dept.name;
        select.appendChild(option);
    });
    loadDepartmentForEdit(); // Load selected (or new) department
}

/**
 * Popola il multi-select delle fasi disponibili per i reparti.
 */
function updateDepartmentPhaseSelectOptions() {
    const select = document.getElementById('departmentPhaseIds');
    select.innerHTML = '';
    appData.phases.forEach(phase => {
        const option = document.createElement('option');
        option.value = phase.id;
        option.textContent = phase.name;
        select.appendChild(option);
    });
}


/**
 * Carica i dati del reparto selezionato nel modulo per la modifica.
 */
function loadDepartmentForEdit() {
    const selectedId = document.getElementById('departmentId').value;
    const nameInput = document.getElementById('departmentName');
    const machineTypesInput = document.getElementById('departmentMachineTypes');
    const finenessesInput = document.getElementById('departmentFinenesses');
    const phaseIdsSelect = document.getElementById('departmentPhaseIds');

    if (selectedId === 'new') {
        cancelEdit('departments');
    } else {
        const dept = appData.departments.find(d => d.id == selectedId);
        if (dept) {
            currentEditingId.departments = dept.id;
            nameInput.value = dept.name;
            machineTypesInput.value = dept.machineTypes.join(', ');
            finenessesInput.value = dept.finenesses.join(', ');

            // Select correct phases in multi-select
            Array.from(phaseIdsSelect.options).forEach(option => {
                option.selected = dept.phaseIds.includes(parseInt(option.value));
            });

            document.getElementById('saveDepartmentBtn').textContent = 'Salva Modifiche Reparto';
            document.getElementById('cancelDepartmentBtn').style.display = 'inline-block';
        } else {
            showNotification('Reparto selezionato non trovato.', 'error');
            cancelEdit('departments');
        }
    }
}

/**
 * Salva un nuovo reparto o aggiorna un reparto esistente.
 */
function saveDepartment() {
    const name = document.getElementById('departmentName').value.trim();
    const machineTypesInput = document.getElementById('departmentMachineTypes').value.trim();
    const finenessesInput = document.getElementById('departmentFinenesses').value.trim();
    const phaseIdsSelect = document.getElementById('departmentPhaseIds');

    if (!name) {
        showNotification('Il nome del reparto è obbligatorio.', 'error');
        return;
    }

    const machineTypes = machineTypesInput ? machineTypesInput.split(',').map(s => s.trim()).filter(s => s) : [];
    const finenesses = finenessesInput ? finenessesInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
    const selectedPhaseIds = Array.from(phaseIdsSelect.selectedOptions).map(option => parseInt(option.value));

    // Validate inputs
    const invalidMachineTypes = machineTypes.filter(type => !appData.machines.some(m => m.type === type));
    if (invalidMachineTypes.length > 0) {
        showNotification(`Tipi macchinari non validi: ${invalidMachineTypes.join(', ')}. Assicurati che esistano in Anagrafica Macchinari.`, 'error');
        return;
    }
    const invalidPhaseIds = selectedPhaseIds.filter(id => !appData.phases.some(p => p.id === id));
    if (invalidPhaseIds.length > 0) {
        showNotification(`Fasi selezionate non valide (ID: ${invalidPhaseIds.join(', ')}). Assicurati che esistano in Anagrafica Fasi.`, 'error');
        return;
    }

    if (currentEditingId.departments) {
        // Update existing department
        const deptToUpdate = appData.departments.find(d => d.id === currentEditingId.departments);
        if (deptToUpdate) {
            if (appData.departments.some(d => d.name.toLowerCase() === name.toLowerCase() && d.id !== currentEditingId.departments)) {
                showNotification('Un reparto con questo nome esiste già.', 'error');
                return;
            }
            deptToUpdate.name = name;
            deptToUpdate.machineTypes = machineTypes;
            deptToUpdate.finenesses = finenesses;
            deptToUpdate.phaseIds = selectedPhaseIds;
            showNotification('Reparto aggiornato con successo!', 'success');
        } else {
            showNotification('Reparto da aggiornare non trovato.', 'error');
        }
    } else {
        // Add new department
        if (appData.departments.some(d => d.name.toLowerCase() === name.toLowerCase())) {
            showNotification('Un reparto con questo nome esiste già.', 'error');
            return;
        }
        const newDepartment = {
            id: Date.now(),
            name: name,
            machineTypes: machineTypes,
            finenesses: finenesses,
            phaseIds: selectedPhaseIds
        };
        appData.departments.push(newDepartment);
        showNotification('Reparto aggiunto con successo!', 'success');
    }

    saveData();
    cancelEdit('departments');
    updateAllTables(); // Explicitly call update after data change
}

/**
 * Elimina un reparto.
 * @param {number} id L'ID del reparto da eliminare.
 */
function deleteDepartment(id) {
    // Check if any article cycle implicitly depends on this department (via machineTypes and phaseIds)
    // This is complex, for simplicity, we assume if a department is deleted, any related plans might become invalid
    // A more robust system might disallow deletion if active plans rely on it.
    // For now, only prevent if phases directly linked in the department are used in active articles.
    
    appData.departments = appData.departments.filter(dept => dept.id !== id);
    saveData();
    updateAllTables(); // Explicitly call update after data change
    showNotification('Reparto eliminato con successo!', 'success');
}

/**
 * Aggiorna la tabella dei reparti.
 * Popola la tabella con i dati presenti in `appData.departments`.
 */
function updateDepartmentsTable() {
    const tbody = document.getElementById('departmentsTable');
    tbody.innerHTML = '';

    if (appData.departments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Nessun reparto definito.</td></tr>';
        return;
    }

    appData.departments.forEach(dept => {
        const machinesList = dept.machineTypes.map(type => {
            if (type === "Manuale") return "Operazioni Manuali";
            return `${type}`;
        }).join(', ');

        const finenessesList = dept.finenesses.length > 0 ? `(Finezze: ${dept.finenesses.join(', ')})` : '';

        const phasesList = dept.phaseIds.map(phaseId => {
            const phase = appData.phases.find(p => p.id === phaseId);
            return phase ? phase.name : 'Fase Sconosciuta';
        }).join(', ');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${dept.name}</td>
            <td>${machinesList}</td>
            <td>${finenessesList}</td>
            <td>${phasesList}</td>
            <td>
                <button class="btn" onclick="editDepartment(${dept.id})">Modifica</button>
                <button class="btn btn-danger" onclick="deleteDepartment(${dept.id})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Helper to load department for editing directly from table button click
function editDepartment(id) {
    document.getElementById('departmentId').value = id;
    loadDepartmentForEdit();
}


// --- GESTIONE MATERIE PRIME ---

/**
 * Popola il dropdown delle materie prime esistenti.
 */
function updateRawMaterialSelectOptions() {
    const select = document.getElementById('rawMaterialSelect');
    select.innerHTML = '<option value="new">-- Aggiungi Nuova Materia Prima --</option>'; 
    appData.rawMaterials.forEach(rm => {
        const option = document.createElement('option');
        option.value = rm.id;
        option.textContent = `${rm.name} (${rm.unit})`;
        select.appendChild(option);
    });
    toggleNewRawMaterialInput(); // Call to adjust form based on selection
}

/**
 * Togglie la visibilità dei campi per l'inserimento di una nuova materia prima.
 */
function toggleNewRawMaterialInput() {
    const select = document.getElementById('rawMaterialSelect');
    const newNameGroup = document.getElementById('newRawMaterialNameGroup');
    const unitInput = document.getElementById('rawMaterialUnit');
    const barcodeInput = document.getElementById('rawMaterialBarcode'); // Get barcode input

    if (select.value === 'new') {
        newNameGroup.style.display = 'block';
        unitInput.value = ''; // Clear unit for new material
        // barcodeInput.value = ''; // Clear barcode as it might have triggered selection
        document.getElementById('saveRawMaterialBtn').textContent = 'Aggiungi Materia Prima';
        document.getElementById('cancelRawMaterialBtn').style.display = 'none';
        currentEditingId.rawMaterials = null; // Ensure editing state is reset
    } else {
        newNameGroup.style.display = 'none';
        document.getElementById('newRawMaterialName').value = ''; 
        const selectedRm = appData.rawMaterials.find(rm => rm.id == select.value);
        if (selectedRm) {
            unitInput.value = selectedRm.unit; 
            // Barcode is for lookup/initial entry, not for modifying existing
            // barcodeInput.value = selectedRm.barcode || ''; // Do not pre-fill barcode for existing
            currentEditingId.rawMaterials = selectedRm.id; // Set editing ID for existing
            document.getElementById('saveRawMaterialBtn').textContent = 'Aggiorna Scorta';
            document.getElementById('cancelRawMaterialBtn').style.display = 'inline-block';
        }
    }
    document.getElementById('rawMaterialQuantity').value = ''; // Always clear quantity input on toggle
}

/**
 * Handles barcode input to auto-select raw material.
 */
function handleBarcodeInput(event) {
    if (event.key === 'Enter' || event.type === 'change' || event.type === 'input') {
        const barcode = document.getElementById('rawMaterialBarcode').value.trim();
        if (barcode) {
            const matchedRm = appData.rawMaterials.find(rm => rm.barcode === barcode);
            if (matchedRm) {
                document.getElementById('rawMaterialSelect').value = matchedRm.id;
                toggleNewRawMaterialInput(); // This will select the matched RM
                showNotification(`Materia prima "${matchedRm.name}" selezionata tramite barcode.`, 'info');
                document.getElementById('rawMaterialBarcode').value = ''; // Clear barcode for next scan
                document.getElementById('rawMaterialQuantity').focus(); // Focus quantity for quick entry
            } else {
                // If no match, and the "new" option is selected, keep barcode input
                if (document.getElementById('rawMaterialSelect').value === 'new') {
                    // Let the user enter a new material, potentially with this barcode
                    showNotification('Nessuna materia prima trovata con questo barcode. Puoi aggiungere una nuova materia prima.', 'warning');
                } else {
                    // If an existing material is selected, and barcode doesn't match, maybe they scanned wrong
                    showNotification('Barcode non corrispondente alla materia prima selezionata.', 'warning');
                }
            }
        }
    }
}


/**
 * Aggiunge una nuova materia prima o aggiorna la scorta di una esistente.
 */
function addRawMaterialOrStock() {
    const selectedRmId = document.getElementById('rawMaterialSelect').value;
    const newRmName = document.getElementById('newRawMaterialName').value.trim();
    const unit = document.getElementById('rawMaterialUnit').value.trim();
    const quantity = parseFloat(document.getElementById('rawMaterialQuantity').value);
    const loadDate = document.getElementById('rawMaterialLoadDate').value;
    const barcode = document.getElementById('rawMaterialBarcode').value.trim(); // Get barcode

    if (!loadDate) {
        showNotification('Seleziona una data di carico.', 'error');
        return;
    }

    if (isNaN(quantity) || quantity < 0) {
        showNotification('La quantità deve essere un numero valido (>= 0).', 'error');
        return;
    }

    let rawMaterial;
    if (selectedRmId === 'new') {
        if (!newRmName || !unit) {
            showNotification('Nome e unità di misura sono obbligatori per la nuova materia prima.', 'error');
            return;
        }
        if (appData.rawMaterials.some(rm => rm.name.toLowerCase() === newRmName.toLowerCase())) {
            showNotification('Una materia prima con questo nome esiste già. Selezionala o scegli un altro nome.', 'error');
            return;
        }
        if (barcode && appData.rawMaterials.some(rm => rm.barcode === barcode)) {
            showNotification('Un\'altra materia prima ha già questo codice barcode. Si prega di usare un codice unico.', 'error');
            return;
        }

        rawMaterial = {
            id: Date.now(),
            name: newRmName,
            unit: unit,
            currentStock: quantity,
            barcode: barcode // Save barcode for new material
        };
        appData.rawMaterials.push(rawMaterial);
        showNotification(`Materia prima "${newRmName}" aggiunta con scorta iniziale di ${quantity.toFixed(2)} ${unit}.`, 'success');
    } else {
        rawMaterial = appData.rawMaterials.find(rm => rm.id == selectedRmId);
        if (!rawMaterial) {
            showNotification('Materia prima selezionata non trovata.', 'error');
            return;
        }
        if (!unit) {
             showNotification('L\'unità di misura è obbligatoria.', 'error');
             return;
        }
        rawMaterial.currentStock += quantity;
        rawMaterial.unit = unit; 
        // Don't update barcode for existing via this path, as it's for initial scan/entry
        showNotification(`Scorta di ${rawMaterial.name} aggiornata. Nuova quantità: ${rawMaterial.currentStock.toFixed(2)} ${rawMaterial.unit}.`, 'success');
    }

    // Always log as a load, with the specified date
    addJournalEntry(rawMaterial.id, 'Carico', quantity, null, false, null, loadDate);

    saveData();
    cancelEdit('rawMaterials'); // Ensures form is reset before updateAllTables
    updateAllTables(); // Explicitly call update after data change
}

/**
 * Allows editing of a raw material's name and unit directly from the table.
 * @param {number} id The ID of the raw material to edit.
 */
function editRawMaterial(id) {
    const rawMaterial = appData.rawMaterials.find(rm => rm.id === id);
    if (rawMaterial) {
        document.getElementById('rawMaterialSelect').value = id;
        toggleNewRawMaterialInput(); // This will pre-fill unit and hide new name field
        // Name is not directly editable in the update form, only unit and quantity
        document.getElementById('rawMaterialQuantity').value = 0; // Set to 0 to indicate quantity to add
    } else {
        showNotification('Materia prima non trovata per la modifica.', 'error');
    }
}


/**
 * Aggiorna la tabella delle scorte di materie prime.
 */
function updateRawMaterialsStockTable() {
    const tbody = document.getElementById('rawMaterialsStockTable');
    tbody.innerHTML = '';

    if (appData.rawMaterials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nessuna materia prima aggiunta.</td></tr>';
        return;
    }

    appData.rawMaterials.forEach(rm => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${rm.name} ${rm.barcode ? `(Barcode: ${rm.barcode})` : ''}</td>
            <td>${rm.currentStock.toFixed(2)}</td>
            <td>${rm.unit}</td>
            <td>
                <button class="btn" onclick="editRawMaterial(${rm.id})">Modifica</button>
                <button class="btn btn-danger" onclick="deleteRawMaterial(${rm.id})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Elimina una materia prima.
 * @param {number} id L'ID della materia prima da eliminare.
 */
function deleteRawMaterial(id) {
    const articlesUsingRm = appData.articles.filter(article => 
        article.bom && article.bom.some(bomItem => bomItem.rawMaterialId === id)
    );

    if (articlesUsingRm.length > 0) {
        const articleCodes = articlesUsingRm.map(a => a.code).join(', ');
        showNotification(`Impossibile eliminare: Materia prima utilizzata in Distinta Base di articoli: ${articleCodes}.`, 'error');
        return;
    }

    const plansUsingRm = appData.productionPlan.filter(plan => 
        plan.status !== 'Completato' && 
        appData.articles.find(a => a.id === plan.articleId)?.bom?.some(bomItem => bomItem.rawMaterialId === id)
    );
     if (plansUsingRm.length > 0) {
        const planRefs = plansUsingRm.map(p => p.articleCode + ' (ID: ' + p.id + ')').join(', ');
        showNotification(`Impossibile eliminare: Materia prima collegata a lotti di produzione non completati: ${planRefs}.`, 'error');
        return;
    }

    appData.rawMaterials = appData.rawMaterials.filter(rm => rm.id !== id);
    appData.warehouseJournal = appData.warehouseJournal.filter(entry => entry.rawMaterialId !== id);

    saveData();
    updateAllTables(); // Explicitly call update after data change
    showNotification('Materia prima eliminata con successo!', 'success');
}

/**
 * Aggiunge un movimento al giornale di magazzino.
 * @param {number} rawMaterialId L'ID della materia prima.
 * @param {string} type Il tipo di movimento ('Carico', 'Scarico da Ordine (Ipotetico)', 'Scarico da Ordine (Effettivo)', 'Rimborso da Annullamento Ordine').
 * @param {number} quantity La quantità del movimento.
 * @param {number|null} relatedPlanId L'ID del piano di produzione (opzionale).
 * @param {boolean} actualConsumptionFlag Indica se il consumo è effettivo (true) o ipotetico (false).
 * @param {number|null} originalHypotheticalEntryId ID dell'entry ipotetica da aggiornare, se presente.
 * @param {string} dateString Data del movimento in formato ISO string (yyyy-mm-ddThh:mm:ss.sssZ)
 */
function addJournalEntry(rawMaterialId, type, quantity, relatedPlanId = null, actualConsumptionFlag = false, originalJournalEntryId = null, dateString = new Date().toISOString()) {
    const entry = {
        id: Date.now() + Math.random(), 
        date: dateString, // Use provided date or current date
        rawMaterialId: rawMaterialId,
        type: type,
        quantity: quantity,
        relatedPlanId: relatedPlanId,
        actualConsumption: actualConsumptionFlag,
        originalJournalEntryId: originalJournalEntryId // To link actual consumption back to hypothetical
    };
    appData.warehouseJournal.push(entry);
}

/**
 * Aggiorna la tabella del giornale di magazzino.
 */
function updateWarehouseJournalTable() {
    const tbody = document.getElementById('warehouseJournalTable');
    tbody.innerHTML = '';

    if (appData.warehouseJournal.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nessun movimento registrato nel giornale.</td></tr>';
        return;
    }

    // Sort journal entries by date, newest first
    const sortedJournal = [...appData.warehouseJournal].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedJournal.forEach(entry => {
        const rawMaterial = appData.rawMaterials.find(rm => rm.id === entry.rawMaterialId);
        const rmName = rawMaterial ? rawMaterial.name : 'Materia Prima Sconosciuta';
        const rmUnit = rawMaterial ? rawMaterial.unit : '';
        const displayQuantity = entry.quantity.toFixed(2);
        const formattedDate = new Date(entry.date).toLocaleDateString('it-IT');

        let statusText = '';
        if (entry.type.includes('Scarico')) {
            statusText = entry.actualConsumption ? 'Effettivo' : 'Ipotetico';
        }

        let relatedInfo = entry.relatedPlanId ? `Lotto ID: ${entry.relatedPlanId}` : '-';

        let actionButton = '';
        // Only show button if it's a hypothetical deduction or already marked actual, but related to a plan
        if (entry.type.includes('Scarico da Ordine') && entry.relatedPlanId) { 
             actionButton = `<button class="btn" style="padding: 5px 10px; font-size: 0.75em;" onclick="openActualConsumptionModal(${entry.id})">Registra/Modifica Consumo</button>`;
        }


        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>${rmName}</td>
            <td>${entry.type}</td>
            <td>${displayQuantity} ${rmUnit}</td>
            <td>${statusText}</td>
            <td>${relatedInfo}</td>
            <td>${actionButton}</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Opens the modal for entering actual consumed quantity.
 * @param {number} journalEntryId The ID of the journal entry to modify.
 */
function openActualConsumptionModal(journalEntryId) {
    const journalEntry = appData.warehouseJournal.find(entry => entry.id === journalEntryId);
    if (!journalEntry) {
        showNotification('Voce di giornale non trovata per la modifica.', 'error');
        return;
    }

    const rawMaterial = appData.rawMaterials.find(rm => rm.id === journalEntry.rawMaterialId);
    const rmName = rawMaterial ? rawMaterial.name : 'Materia Prima Sconosciuta';
    const rmUnit = rawMaterial ? rawMaterial.unit : '';

    document.getElementById('modalRmInfo').innerHTML = `Aggiorna il consumo effettivo per <strong>${rmName}</strong> (Lotto ID: ${journalEntry.relatedPlanId || 'N/A'}).<br>Quantità ${journalEntry.actualConsumption ? 'attuale' : 'ipotetica'}: ${journalEntry.quantity.toFixed(2)} ${rmUnit}.`;
    document.getElementById('actualConsumedQuantity').value = journalEntry.quantity.toFixed(2);
    currentModalJournalEntryId = journalEntryId;
    document.getElementById('actualConsumptionModal').classList.add('show');
}

/**
 * Confirms and applies the actual consumed quantity from the modal.
 */
function confirmActualConsumption() {
    const actualQtyInput = document.getElementById('actualConsumedQuantity').value;
    const actualQuantity = parseFloat(actualQtyInput);

    if (isNaN(actualQuantity) || actualQuantity < 0) {
        showNotification('Quantità effettiva non valida. Riprova.', 'error');
        return;
    }

    if (currentModalJournalEntryId === null) {
        showNotification('Nessuna voce di giornale selezionata per l\'aggiornamento.', 'error');
        return;
    }

    const journalEntry = appData.warehouseJournal.find(entry => entry.id === currentModalJournalEntryId);
    if (!journalEntry) {
        showNotification('Voce di giornale non trovata per l\'aggiornamento.', 'error');
        return;
    }

    const rawMaterial = appData.rawMaterials.find(rm => rm.id === journalEntry.rawMaterialId);
    if (!rawMaterial) {
        showNotification('Materia prima non trovata per la voce di giornale.', 'error');
        return;
    }

    const difference = actualQuantity - journalEntry.quantity;
    rawMaterial.currentStock -= difference; 

    journalEntry.quantity = actualQuantity;
    journalEntry.type = 'Scarico da Ordine (Effettivo)';
    journalEntry.actualConsumption = true;
    journalEntry.date = new Date().toISOString(); 

    saveData();
    updateAllTables(); 
    showNotification(`Consumo effettivo per "${rawMaterial.name}" aggiornato a ${actualQuantity.toFixed(2)} ${rawMaterial.unit}.`, 'success');
    document.getElementById('actualConsumptionModal').classList.remove('show');
    currentModalJournalEntryId = null; // Clear the stored ID
}


/**
 * Deduce raw materials when a plan is created/added.
 * Records a 'Scarico da Ordine (Ipotetico)' in the journal.
 * @param {Object} plan The production plan object.
 */
function deductRawMaterialsForPlan(plan) {
    const article = appData.articles.find(a => a.id === plan.articleId);
    if (!article || !article.bom || article.bom.length === 0) {
        console.warn(`Articolo ${plan.articleCode} non ha una distinta base. Nessun materiale scaricato.`);
        return;
    }

    let allMaterialsAvailable = true;
    let materialNeeds = [];

    for (const bomItem of article.bom) {
        const rawMaterial = appData.rawMaterials.find(rm => rm.id === bomItem.rawMaterialId);
        const requiredQuantity = bomItem.quantityPerPiece * plan.quantity;
        if (!rawMaterial || rawMaterial.currentStock < requiredQuantity) {
            allMaterialsAvailable = false;
            const rmName = rawMaterial ? rawMaterial.name : `ID:${bomItem.rawMaterialId}`;
            showNotification(`Materia prima "${rmName}" insufficiente per il lotto ${plan.articleCode} (ID: ${plan.id}). Necessari: ${requiredQuantity.toFixed(2)} ${rawMaterial ? rawMaterial.unit : ''}, Disponibili: ${rawMaterial ? rawMaterial.currentStock.toFixed(2) : '0'}.`, 'error');
            return false; 
        }
        materialNeeds.push({ rawMaterial, requiredQuantity });
    }

    if (allMaterialsAvailable) {
        for (const { rawMaterial, requiredQuantity } of materialNeeds) {
            rawMaterial.currentStock -= requiredQuantity;
            addJournalEntry(rawMaterial.id, 'Scarico da Ordine (Ipotetico)', requiredQuantity, plan.id, false);
        }
        showNotification(`Materie prime per lotto ${plan.articleCode} (ID: ${plan.id}) scaricate (ipotetico).`, 'success');
        updateRawMaterialsStockTable();
        updateWarehouseJournalTable();
        return true; 
    }
    return false;
}


// --- GESTIONE ARTICOLI ---

/**
 * Popola il dropdown degli articoli per la modifica.
 */
function updateArticleSelectOptions() {
    const select = document.getElementById('articleId');
    select.innerHTML = '<option value="new">-- Nuovo Articolo --</option>';
    appData.articles.forEach(article => {
        const option = document.createElement('option');
        option.value = article.id;
        option.textContent = `${article.code} - ${article.description}`;
        select.appendChild(option);
    });
    loadArticleForEdit(); // Load selected (or new) article
}

/**
 * Carica i dati di un articolo nel modulo per la modifica.
 */
function loadArticleForEdit() {
    const selectedId = document.getElementById('articleId').value;
    const codeInput = document.getElementById('articleCode');
    const descriptionInput = document.getElementById('articleDescription');
    const colorInput = document.getElementById('articleColor');
    const clientInput = document.getElementById('articleClient');
    const cycleStepsDiv = document.getElementById('cycleSteps');
    const bomItemsDiv = document.getElementById('bomItems');

    if (selectedId === 'new') {
        cancelEdit('articles');
    } else {
        const article = appData.articles.find(a => a.id == selectedId);
        if (article) {
            currentEditingId.articles = article.id;
            codeInput.value = article.code;
            descriptionInput.value = article.description;
            colorInput.value = article.color || '';
            clientInput.value = article.client || '';

            // Clear existing dynamic steps
            cycleStepsDiv.innerHTML = '';
            bomItemsDiv.innerHTML = '';

            // Populate cycle steps
            article.cycle.forEach(step => {
                addCycleStep(); // Add a new empty step row
                const lastStepDiv = cycleStepsDiv.lastElementChild;
                lastStepDiv.querySelector('.phase-select').value = step.phaseId;
                lastStepDiv.querySelector('.machine-type-select').value = step.machineType;
                lastStepDiv.querySelector('.fineness-select').value = step.fineness;
            });

            // Populate BOM items
            article.bom.forEach(item => {
                addBomItem(); // Add a new empty BOM row
                const lastBomDiv = bomItemsDiv.lastElementChild;
                lastBomDiv.querySelector('.raw-material-select').value = item.rawMaterialId;
                lastBomDiv.querySelector('.quantity-per-piece-input').value = item.quantityPerPiece;
            });

            document.getElementById('saveArticleBtn').textContent = 'Salva Modifiche Articolo';
            document.getElementById('cancelArticleBtn').style.display = 'inline-block';
        } else {
            showNotification('Articolo selezionato non trovato.', 'error');
            cancelEdit('articles');
        }
    }
}

/**
 * Aggiunge un nuovo passo (fase + tipo macchina + finezza) al ciclo di lavorazione di un articolo.
 */
function addCycleStep() {
    if (appData.phases.length === 0) {
        showNotification('Aggiungi prima delle fasi di lavorazione (sezione Fasi).', 'error');
        return;
    }
    
    if (appData.machines.length === 0) {
        showNotification('Aggiungi prima dei macchinari con tipo e finezza definiti (sezione Macchinari).', 'error');
        return;
    }
    
    const availableMachineTypes = Array.from(new Set(appData.machines.map(m => m.type)));
    const availableFinenesses = Array.from(new Set(appData.machines.map(m => m.fineness))).sort((a, b) => a - b);

    const stepDiv = document.createElement('div');
    stepDiv.className = 'cycle-step';
    stepDiv.innerHTML = `
        <select class="phase-select" style="flex: 1;">
            <option value="">Seleziona fase...</option>
            ${appData.phases.map(phase => `<option value="${phase.id}">${phase.name}</option>`).join('')}
        </select>
        <select class="machine-type-select" style="flex: 1;">
            <option value="">Tipo macchina...</option>
            ${availableMachineTypes.map(type => `<option value="${type}">${type}</option>`).join('')}
        </select>
        <select class="fineness-select" style="flex: 1;">
            <option value="">Finezza...</option>
            ${availableFinenesses.map(fineness => `<option value="${fineness}">${fineness}</option>`).join('')}
        </select>
        <button class="btn btn-danger" onclick="removeCycleStep(this)">Rimuovi</button>
    `;
    document.getElementById('cycleSteps').appendChild(stepDiv);
}

/**
 * Rimuove un passo dal ciclo di lavorazione.
 * @param {HTMLElement} button Il bottone "Rimuovi" cliccato.
 */
function removeCycleStep(button) {
    button.parentElement.remove();
}

/**
 * Aggiunge una riga per definire un componente della Distinta Base (BOM).
 */
function addBomItem() {
    if (appData.rawMaterials.length === 0) {
        showNotification('Aggiungi prima delle materie prime (sezione Materie Prime).', 'error');
        return;
    }

    const itemDiv = document.createElement('div');
    itemDiv.className = 'bom-item';
    itemDiv.innerHTML = `
        <select class="raw-material-select" style="flex: 2;">
            <option value="">Seleziona materia prima...</option>
            ${appData.rawMaterials.map(rm => `<option value="${rm.id}">${rm.name} (${rm.unit})</option>`).join('')}
        </select>
        <input type="number" class="quantity-per-piece-input" placeholder="Quantità per pezzo" min="0.001" step="0.001" style="flex: 1;">
        <button class="btn btn-danger" onclick="removeBomItem(this)">Rimuovi</button>
    `;
    document.getElementById('bomItems').appendChild(itemDiv);
}

/**
 * Rimuove un elemento dalla Distinta Base (BOM).
 * @param {HTMLElement} button Il bottone "Rimuovi" cliccato.
 */
function removeBomItem(button) {
    button.parentElement.remove();
}

/**
 * Salva un nuovo articolo o aggiorna un articolo esistente.
 */
function saveArticle() {
    const articleId = document.getElementById('articleId').value;
    const code = document.getElementById('articleCode').value.trim();
    const description = document.getElementById('articleDescription').value.trim();
    const color = document.getElementById('articleColor').value.trim();
    const client = document.getElementById('articleClient').value.trim();
    
    if (!code || !description) {
        showNotification('Codice e Descrizione articolo sono obbligatori.', 'error');
        return;
    }
    
    const cycleStepsElements = Array.from(document.querySelectorAll('.cycle-step'));
    const cycleSteps = cycleStepsElements.map(step => {
        const phaseId = parseInt(step.querySelector('.phase-select').value);
        const machineType = step.querySelector('.machine-type-select').value;
        const fineness = parseInt(step.querySelector('.fineness-select').value);

        return { phaseId, machineType, fineness };
    }).filter(step => !isNaN(step.phaseId) && step.machineType && !isNaN(step.fineness)); 
    
    if (cycleSteps.length === 0) {
        showNotification('Aggiungi almeno una fase, un tipo di macchina e una finezza al ciclo di lavorazione.', 'error');
        return;
    }

    for (const step of cycleSteps) {
        if (!appData.phases.some(p => p.id === step.phaseId)) {
            showNotification(`Fase non valida selezionata per il passo del ciclo. ID: ${step.phaseId}`, 'error');
            return;
        }
        if (!appData.machines.some(m => m.type === step.machineType && m.fineness === step.fineness)) {
            showNotification(`Combinazione Tipo Macchina "${step.machineType}" / Finezza "${step.fineness}" non valida o inesistente per il passo del ciclo.`, 'error');
            return;
        }
    }

    const bomItemsElements = Array.from(document.querySelectorAll('.bom-item'));
    const bom = bomItemsElements.map(item => {
        const rawMaterialId = parseInt(item.querySelector('.raw-material-select').value);
        const quantityPerPiece = parseFloat(item.querySelector('.quantity-per-piece-input').value);
        return { rawMaterialId, quantityPerPiece };
    }).filter(item => !isNaN(item.rawMaterialId) && !isNaN(item.quantityPerPiece) && item.quantityPerPiece > 0);

    if (bom.length === 0) {
         showNotification('Aggiungi almeno una materia prima alla Distinta Base con una quantità valida (maggiore di 0).', 'error');
         return;
    }

    for (const item of bom) {
        if (!appData.rawMaterials.some(rm => rm.id === item.rawMaterialId)) {
            showNotification(`Materia prima non valida selezionata nella Distinta Base. ID: ${item.rawMaterialId}`, 'error');
            return;
        }
    }
    
    if (currentEditingId.articles) {
        // Update existing article
        const articleToUpdate = appData.articles.find(a => a.id === currentEditingId.articles);
        if (articleToUpdate) {
            if (appData.articles.some(a => a.code.toLowerCase() === code.toLowerCase() && a.id !== currentEditingId.articles)) {
                showNotification('Codice articolo già esistente. Scegli un codice unico.', 'error');
                return;
            }
            articleToUpdate.code = code;
            articleToUpdate.description = description;
            articleToUpdate.color = color;
            articleToUpdate.client = client;
            articleToUpdate.cycle = cycleSteps;
            articleToUpdate.bom = bom;
            showNotification('Articolo aggiornato con successo!', 'success');
        } else {
            showNotification('Articolo da aggiornare non trovato.', 'error');
        }
    } else {
        // Add new article
        if (appData.articles.some(a => a.code.toLowerCase() === code.toLowerCase())) {
            showNotification('Codice articolo già esistente. Scegli un codice unico.', 'error');
            return;
        }
        const article = { id: Date.now(), code, description, color, client, cycle: cycleSteps, bom: bom };
        appData.articles.push(article);
        showNotification('Articolo aggiunto con successo!', 'success');
    }

    saveData();
    cancelEdit('articles');
    updateAllTables(); // Explicitly call update after data change
}

/**
 * Aggiorna la tabella degli articoli.
 * Popola la tabella con i dati presenti in `appData.articles`.
 */
function updateArticlesTable() {
    const tbody = document.getElementById('articlesTable');
    tbody.innerHTML = ''; 
    
    if (appData.articles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nessun articolo aggiunto.</td></tr>';
        return;
    }

    appData.articles.forEach(article => {
        const phasesDisplay = article.cycle.map(step => {
            const phase = appData.phases.find(p => p.id === step.phaseId);
            return `${phase ? phase.name : 'Fase Sconosciuta'} (${step.machineType || 'N/A'} F${step.fineness || 'N/A'})`;
        }).join('<br>'); 

        const bomDisplay = article.bom && article.bom.length > 0
            ? article.bom.map(item => {
                const rm = appData.rawMaterials.find(rm => rm.id === item.rawMaterialId);
                return `${rm ? rm.name : 'Materia Prima Sconosciuta'}: ${item.quantityPerPiece} ${rm ? rm.unit : ''}/pz`;
            }).join('<br>')
            : 'Nessuna';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${article.code}</strong></td>
            <td>${article.description}</td>
            <td>${article.color || '-'}</td>
            <td>${article.client || '-'}</td>
            <td>${phasesDisplay}</td>
            <td>${bomDisplay}</td>
            <td>
                <button class="btn" onclick="editArticle(${article.id})">Modifica</button>
                <button class="btn" onclick="deleteArticle(${article.id})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Helper to load article for editing directly from table button click
function editArticle(id) {
    document.getElementById('articleId').value = id;
    loadArticleForEdit();
}

/**
 * Elimina un articolo.
 * @param {number} id L'ID dell'articolo da eliminare.
 */
function deleteArticle(id) {
    const plansUsingArticle = appData.productionPlan.filter(plan => 
        plan.status !== 'Completato' && plan.articleId === id
    );
    if (plansUsingArticle.length > 0) {
        const planRefs = plansUsingArticle.map(p => p.articleCode + ' (ID: ' + p.id + ')').join(', ');
        showNotification(`Impossibile eliminare: Articolo collegato a lotti di produzione non completati: ${planRefs}.`, 'error');
        return;
    }


    appData.articles = appData.articles.filter(article => article.id !== id);
    appData.productionPlan = appData.productionPlan.filter(plan => plan.articleId !== id);
    appData.warehouseJournal = appData.warehouseJournal.filter(entry => {
        const plan = appData.productionPlan.find(p => p.id === entry.relatedPlanId);
        return !entry.relatedPlanId || plan; 
    });

    saveData();
    updateAllTables(); // Explicitly call update after data change
    showNotification('Articolo eliminato con successo!', 'success');
}

/**
 * Aggiorna le opzioni del menu a tendina degli articoli nella pagina di pianificazione.
 */
function updatePlanningOptions() {
    const select = document.getElementById('planningArticle');
    const editSelect = document.getElementById('editPlanningArticle'); // For edit modal
    
    select.innerHTML = '<option value="">Seleziona articolo...</option>'; 
    editSelect.innerHTML = '<option value="">Seleziona articolo...</option>';

    appData.articles.forEach(article => {
        const option = document.createElement('option');
        option.value = article.id;
        option.textContent = `${article.code} - ${article.description}`;
        select.appendChild(option);

        const editOption = option.cloneNode(true); // Clone for edit modal
        editSelect.appendChild(editOption);
    });
}

// --- PIANIFICAZIONE ---

/**
 * Popola il dropdown dei lotti di pianificazione per la modifica.
 */
function updatePlanningLotSelectOptions() {
    const select = document.getElementById('planningLotId');
    select.innerHTML = '<option value="new">-- Nuovo Lotto --</option>';
    appData.productionPlan.forEach(plan => {
        const article = appData.articles.find(a => a.id === plan.articleId);
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = `ID: ${plan.id} - ${article ? article.code : 'Sconosciuto'} (Qt: ${plan.quantity}) - ${plan.status}`;
        select.appendChild(option);
    });
    loadPlanningForEdit(); // Load selected (or new) lot
}

/**
 * Carica i dati di un lotto di pianificazione nel modulo per la modifica.
 */
function loadPlanningForEdit() {
    const selectedId = document.getElementById('planningLotId').value;
    const articleSelect = document.getElementById('planningArticle');
    const quantityInput = document.getElementById('planningQuantity');
    const typeSelect = document.getElementById('planningType'); // New
    const prioritySelect = document.getElementById('planningPriority');
    const notesTextarea = document.getElementById('planningNotes');
    const startDateInput = document.getElementById('planningStartDate');
    const deliveryResultDiv = document.getElementById('deliveryResult');

    if (selectedId === 'new') {
        cancelEdit('planning');
        // Ensure date input is today for new plans
        document.getElementById('planningStartDate').valueAsDate = new Date();
    } else {
        const plan = appData.productionPlan.find(p => p.id == selectedId);
        if (plan) {
            currentEditingId.planning = plan.id;
            articleSelect.value = plan.articleId;
            quantityInput.value = plan.quantity;
            typeSelect.value = plan.type || 'production'; // Set type, default if missing
            prioritySelect.value = plan.priority;
            notesTextarea.value = plan.notes || '';
            startDateInput.value = plan.startDate ? new Date(plan.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            
            // Show current delivery result
            const formattedDeliveryDate = new Date(plan.estimatedDeliveryDate).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            deliveryResultDiv.innerHTML = `
                <div class="delivery-date">
                    📅 Consegna Attuale: <br><strong>${formattedDeliveryDate}</strong>
                </div>
                <p><strong>Inizio Attuale:</strong> ${new Date(plan.startDate).toLocaleDateString('it-IT')}</p>
                <p><strong>Giorni lavorativi totali:</strong> ${plan.totalDays}</p>
            `;

            document.getElementById('savePlanningBtn').textContent = 'Salva Modifiche Pianificazione';
            document.getElementById('cancelPlanningBtn').style.display = 'inline-block';
        } else {
            showNotification('Lotto di pianificazione selezionato non trovato.', 'error');
            cancelEdit('planning');
        }
    }
}


/**
 * Calcola la data di consegna stimata per un articolo e una quantità,
 * a partire da una data di inizio desiderata.
 * @param {number} articleId L'ID dell'articolo.
 * @param {number} quantity La quantità da produrre.
 * @param {string} priority La priorità del lotto.
 * @param {string} notes Le note per il lotto.
 * @param {string} type Il tipo di pianificazione ('production', 'sampling'). // New
 * @param {string|null} desiredStartDateString La data di inizio desiderata in formato ISO-MM-DD, o null per usare la data odierna.
 * @returns {Object|null} Oggetto con i dettagli della pianificazione calcolata o null se ci sono errori.
 */
function calculateDeliveryDetails(articleId, quantity, priority, notes, type, desiredStartDateString = null) {
    if (isNaN(articleId) || !articleId || isNaN(quantity) || quantity <= 0) {
        showNotification('ID articolo, quantità o quantità non validi.', 'error');
        return null;
    }
    
    const article = appData.articles.find(a => a.id === articleId);
    if (!article) {
        showNotification('Articolo selezionato non trovato.', 'error');
        return null;
    }
    
    let totalWorkingDaysNeeded = 0;
    let bottleneckInfo = '';
    let detailedSteps = [];
    
    let currentStartDate = desiredStartDateString ? new Date(desiredStartDateString) : new Date();
    currentStartDate.setHours(0, 0, 0, 0); 

    while (currentStartDate.getDay() === 0 || currentStartDate.getDay() === 6) { 
        currentStartDate.setDate(currentStartDate.getDate() + 1);
    }

    let currentWorkingDayOffset = 0; 

    for (const step of article.cycle) {
        const phase = appData.phases.find(p => p.id === step.phaseId);
        const matchingMachines = appData.machines.filter(m => m.type === step.machineType && m.fineness === step.fineness);

        if (!phase) {
            showNotification(`Errore: fase "${step.phaseId}" nel ciclo dell'articolo non trovata.`, 'error');
            return null;
        }
        if (matchingMachines.length === 0) {
            showNotification(`Errore: Nessun macchinario disponibile per tipo "${step.machineType}" e finezza "${step.fineness}" per la fase "${phase.name}".`, 'error');
            return null;
        }
        
        const totalMatchingMachineCapacity = matchingMachines.reduce((sum, m) => sum + m.capacity, 0);

        const totalPhaseMinutes = quantity * phase.time;
        const totalPhaseHours = totalPhaseMinutes / 60;
        const daysBasedOnPhaseTime = Math.ceil(totalPhaseHours / 8); 

        const daysBasedOnMachineCapacity = totalMatchingMachineCapacity > 0 ? Math.ceil(quantity / totalMatchingMachineCapacity) : Infinity;
        
        const actualDaysForStep = Math.max(daysBasedOnPhaseTime, daysBasedOnMachineCapacity);
        
        if (actualDaysForStep === Infinity || actualDaysForStep === 0) { 
            showNotification(`Capacità macchinari insufficiente o tempo di fase nullo per la fase "${phase.name}" (${step.machineType} F${step.fineness}). Impossibile calcolare.`, 'error');
            return null;
        }

        const stepStartOffset = currentWorkingDayOffset;
        currentWorkingDayOffset += actualDaysForStep;
        const stepEndOffset = currentWorkingDayOffset; // Corrected variable name

        detailedSteps.push({
            phase: phase.name, 
            phaseId: phase.id,
            machineType: step.machineType,
            fineness: step.fineness,
            quantity: quantity, 
            phaseTimePerPiece: phase.time,
            combinedMachineCapacityPerDay: totalMatchingMachineCapacity,
            calculatedDays: actualDaysForStep, 
            stepStartWorkingDayOffset: stepStartOffset, 
            stepEndWorkingDayOffset: stepEndOffset 
        });
    }

    totalWorkingDaysNeeded = currentWorkingDayOffset; 
    const estimatedDeliveryDate = addWorkingDays(new Date(currentStartDate.getTime()), totalWorkingDaysNeeded);
    
    return {
        articleId: articleId,
        articleCode: article.code,
        articleDescription: article.description,
        quantity: quantity,
        priority: priority,
        notes: notes,
        type: type, // New: Add type to plan
        startDate: currentStartDate.toISOString(),
        estimatedDeliveryDate: estimatedDeliveryDate.toISOString(),
        totalDays: totalWorkingDaysNeeded,
        status: 'In attesa',
        detailedSteps: detailedSteps,
        bottleneck: bottleneckInfo,
        rmJournalEntryIds: [] 
    };
}

/**
 * Funzione chiamata dal pulsante "Calcola Consegna" nella pagina Pianificazione
 */
function calculateDelivery() {
    const articleId = parseInt(document.getElementById('planningArticle').value);
    const quantity = parseInt(document.getElementById('planningQuantity').value);
    const type = document.getElementById('planningType').value; // New: Get type
    const priority = document.getElementById('planningPriority').value;
    const notes = document.getElementById('planningNotes').value.trim();
    const startDate = document.getElementById('planningStartDate').value;

    if (!startDate) {
        showNotification('Seleziona una data di inizio per la pianificazione.', 'error');
        return;
    }

    currentCalculatedPlanningDetails = calculateDeliveryDetails(articleId, quantity, priority, notes, type, startDate); // Pass type

    const resultDiv = document.getElementById('deliveryResult');
    if (currentCalculatedPlanningDetails) {
        const formattedStartDate = new Date(currentCalculatedPlanningDetails.startDate).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const formattedDeliveryDate = new Date(currentCalculatedPlanningDetails.estimatedDeliveryDate).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        resultDiv.innerHTML = `
            <div class="delivery-date">
                📅 Consegna Attuale: <br><strong>${formattedDeliveryDate}</strong>
            </div>
            <p><strong>Inizio Stimato:</strong> ${formattedStartDate}</p>
            <p><strong>Giorni lavorativi totali stimati:</strong> ${currentCalculatedPlanningDetails.totalDays}</p>
            <p><strong>Dettagli per fase:</strong></p>
            <ul>
                ${currentCalculatedPlanningDetails.detailedSteps.map(d => `<li>${d.phase} (${d.machineType} F${d.fineness}): ${d.calculatedDays} giorni (Capacità combinata: ${d.combinedMachineCapacityPerDay} pz/giorno)</li>`).join('')}
            </ul>
            ${currentCalculatedPlanningDetails.bottleneck ? `<p class="error"><strong>Attenzione:</strong> ${currentCalculatedPlanningDetails.bottleneck}</p>` : ''}
        `;
        document.getElementById('savePlanningBtn').style.display = 'inline-block';
        document.getElementById('savePlanningBtn').textContent = currentEditingId.planning ? 'Salva Modifiche Pianificazione' : 'Aggiungi alla Pianificazione';
        document.getElementById('cancelPlanningBtn').style.display = 'inline-block';
        showNotification('Calcolo di consegna completato. Puoi salvare la pianificazione.', 'success');
    } else {
        resultDiv.innerHTML = '<p class="error">Impossibile calcolare la pianificazione. Controlla gli input e le configurazioni.</p>';
        document.getElementById('savePlanningBtn').style.display = 'none';
        document.getElementById('cancelPlanningBtn').style.display = 'none';
    }
}

/**
 * Aggiunge un numero specificato di giorni lavorativi a una data.
 * Salta sabati e domeniche.
 * @param {Date} startDate La data di inizio.
 * @param {number} daysToAdd The number of working days to add.
 * @returns {Date} The resulting date.
 */
function addWorkingDays(startDate, daysToAdd) {
    const date = new Date(startDate.getTime()); 
    let addedDays = 0;
    while (addedDays < daysToAdd) {
        date.setDate(date.getDate() + 1); 
        const dayOfWeek = date.getDay(); 
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { 
            addedDays++;
        }
    }
    return date;
}

/**
 * Saves a new planning lot or updates an existing one.
 */
function savePlanning() {
    if (!currentCalculatedPlanningDetails) {
        showNotification('Nessuna pianificazione calcolata da salvare. Clicca "Calcola Consegna" prima.', 'error');
        return;
    }

    const article = appData.articles.find(a => a.id === currentCalculatedPlanningDetails.articleId);
    if (!article || !article.bom || article.bom.length === 0) {
         showNotification(`L'articolo "${article ? article.code : 'Sconosciuto'}" non ha una distinta base definita. Nessun materiale scaricato.`, 'warning');
    } else {
        // If it's an existing plan, we need to "refund" old hypothetical deductions
        if (currentEditingId.planning) {
            const originalPlan = appData.productionPlan.find(p => p.id === currentEditingId.planning);
            if (originalPlan) {
                revertRawMaterialsForPlan(originalPlan); // Refund previous hypothetical
            }
        }

        // Deduct new hypothetical materials
        let allMaterialsAvailable = true;
        let materialDeductions = [];

        for (const bomItem of article.bom) {
            const rawMaterial = appData.rawMaterials.find(rm => rm.id === bomItem.rawMaterialId);
            const requiredQuantity = bomItem.quantityPerPiece * currentCalculatedPlanningDetails.quantity;
            if (!rawMaterial || rawMaterial.currentStock < requiredQuantity) {
                allMaterialsAvailable = false;
                const rmName = rawMaterial ? rawMaterial.name : `ID:${bomItem.rawMaterialId}`;
                showNotification(`Materia prima "${rmName}" insufficiente. Necessari: ${requiredQuantity.toFixed(2)} ${rawMaterial ? rawMaterial.unit : ''}, Disponibili: ${rawMaterial ? rawMaterial.currentStock.toFixed(2) : '0'}. L\'ordine non può essere salvato.`, 'error');
                // If material is insufficient, revert any deductions made in this save attempt and stop
                if (currentEditingId.planning) {
                     // Re-apply original deductions if this was an edit and it failed
                     deductRawMaterialsForPlan(originalPlan);
                } else {
                     // If new plan, no need to revert anything as we haven't deducted yet
                }
                return; 
            }
            materialDeductions.push({ rawMaterialId: bomItem.rawMaterialId, quantity: requiredQuantity });
        }

        if (allMaterialsAvailable) {
            currentCalculatedPlanningDetails.rmJournalEntryIds = []; 
            for (const deduction of materialDeductions) {
                const rm = appData.rawMaterials.find(r => r.id === deduction.rawMaterialId);
                if (rm) {
                    rm.currentStock -= deduction.quantity;
                    addJournalEntry(rm.id, 'Scarico da Ordine (Ipotetico)', deduction.quantity, currentCalculatedPlanningDetails.id, false);
                }
            }
        } else {
            showNotification('Errore inatteso nella verifica delle materie prime.', 'error');
            return;
        }
    }
    
    if (currentEditingId.planning) {
        // Update existing plan
        const planIndex = appData.productionPlan.findIndex(p => p.id === currentEditingId.planning);
        if (planIndex !== -1) {
            appData.productionPlan[planIndex] = { ...currentCalculatedPlanningDetails, id: currentEditingId.planning };
            showNotification('Pianificazione aggiornata con successo!', 'success');
        } else {
            showNotification('Pianificazione da aggiornare non trovata.', 'error');
        }
    } else {
        // Add new plan
        const newPlan = { ...currentCalculatedPlanningDetails, id: Date.now() }; 
        appData.productionPlan.push(newPlan);
        showNotification('Pianificazione aggiunta al programma con successo!', 'success');
    }

    saveData();
    cancelEdit('planning');
    updateAllTables(); // Explicitly call update after data change
}


/**
 * Reverts hypothetical raw material deductions for a given plan.
 * This is called when a plan is deleted or before it's re-deducted during an edit.
 * @param {Object} plan The production plan object whose materials to revert.
 */
function revertRawMaterialsForPlan(plan) {
    const article = appData.articles.find(a => a.id === plan.articleId);
    if (!article || !article.bom || article.bom.length === 0) {
        return;
    }

    // Find hypothetical (or actual if already updated) journal entries for this plan
    const relatedJournalEntries = appData.warehouseJournal.filter(entry => 
        entry.relatedPlanId === plan.id && entry.rawMaterialId && entry.type.includes('Scarico')
    );

    for (const entry of relatedJournalEntries) {
        const rawMaterial = appData.rawMaterials.find(rm => rm.id === entry.rawMaterialId);
        if (rawMaterial) {
            rawMaterial.currentStock += entry.quantity; // Add back the deducted quantity
        }
    }
}

/**
 * Aggiorna la lista dei lotti in pianificazione nella pagina "Programma".
 */
function updatePlanningList() {
    const planningListDiv = document.getElementById('planningList');
    planningListDiv.innerHTML = '';
    
    if (appData.productionPlan.length === 0) {
        planningListDiv.innerHTML = '<p>Nessun lotto in pianificazione.</p>';
        return;
    }

    const sortedPlan = [...appData.productionPlan].sort((a, b) => 
        new Date(a.estimatedDeliveryDate) - new Date(b.estimatedDeliveryDate)
    );

    sortedPlan.forEach(plan => {
        const article = appData.articles.find(a => a.id === plan.articleId);
        const articleInfo = article ? `${article.code} - ${article.description}` : 'Articolo Sconosciuto';
        const formattedStartDate = new Date(plan.startDate).toLocaleDateString('it-IT');
        const formattedDeliveryDate = new Date(plan.estimatedDeliveryDate).toLocaleDateString('it-IT');
        const priorityClass = `priority-${plan.priority}`;
        const typeClass = `plan-type-${plan.type || 'production'}`; // Apply type class

        const cycleStepsDisplay = plan.detailedSteps.map(step => { 
            return `${step.phase} (${step.machineType || 'N/A'} F${step.fineness || 'N/A'})`;
        }).join('<br>');

        let completeButtonHtml = '';
        if (plan.status !== 'Completato') {
            completeButtonHtml = `<button class="btn" onclick="markPlanningComplete(${plan.id})">Completa</button>`;
        } else {
            completeButtonHtml = `<button class="btn" style="background-color: #ccc; cursor: not-allowed;">Completato</button>`;
        }

        const planCard = document.createElement('div');
        planCard.className = `planning-card ${priorityClass} ${typeClass}`; // Add type class here
        planCard.innerHTML = `
            <h4>${articleInfo} (Qt: ${plan.quantity})</h4>
            <p><strong>Tipo:</strong> ${plan.type === 'production' ? 'Produzione' : 'Campionatura'}</p> <!-- Display type -->
            <p><strong>Inizio:</strong> ${formattedStartDate}</p>
            <p><strong>Consegna Stimata:</strong> ${formattedDeliveryDate}</p>
            <p><strong>Priorità:</strong> ${plan.priority.charAt(0).toUpperCase() + plan.priority.slice(1)}</p>
            <p><strong>Stato:</strong> ${plan.status}</p>
            <p><strong>Ciclo:</strong><br>${cycleStepsDisplay}</p>
            ${plan.notes ? `<p><strong>Note:</strong> ${plan.notes}</p>` : ''}
            
            <div class="reschedule-controls">
                <label for="rescheduleDate-${plan.id}">Nuova data inizio:</label>
                <input type="date" id="rescheduleDate-${plan.id}" value="${new Date(plan.startDate).toISOString().split('T')[0]}">
                <button class="btn" onclick="reschedulePlanning(${plan.id})">Ripianifica</button>
            </div>

            <button class="btn" onclick="openEditPlanningModal(${plan.id})">Modifica</button>
            <button class="btn btn-danger" onclick="deletePlanning(${plan.id})">Rimuovi</button>
            ${completeButtonHtml}
        `;
        planningListDiv.appendChild(planCard);
    });
}

/**
 * Apre il modale per la modifica di un lotto di pianificazione.
 * @param {number} planId L'ID del lotto da modificare.
 */
function openEditPlanningModal(planId) {
    const plan = appData.productionPlan.find(p => p.id === planId);
    if (!plan) {
        showNotification('Lotto di pianificazione non trovato.', 'error');
        return;
    }

    document.getElementById('editPlanningLotId').value = plan.id;
    document.getElementById('editPlanningArticle').value = plan.articleId;
    document.getElementById('editPlanningQuantity').value = plan.quantity;
    document.getElementById('editPlanningType').value = plan.type || 'production';
    document.getElementById('editPlanningPriority').value = plan.priority;
    document.getElementById('editPlanningNotes').value = plan.notes || '';
    document.getElementById('editPlanningStartDate').value = new Date(plan.startDate).toISOString().split('T')[0];

    // Set currentEditingId to use existing savePlanning logic
    currentEditingId.planning = plan.id; 
    currentCalculatedPlanningDetails = null; // Clear old calculated details, will be recalculated on save.

    document.getElementById('editPlanningModal').classList.add('show');
}

/**
 * Salva le modifiche da editPlanningModal.
 */
function saveEditedPlanning() {
    const planId = parseInt(document.getElementById('editPlanningLotId').value);
    const articleId = parseInt(document.getElementById('editPlanningArticle').value);
    const quantity = parseInt(document.getElementById('editPlanningQuantity').value);
    const type = document.getElementById('editPlanningType').value;
    const priority = document.getElementById('editPlanningPriority').value;
    const notes = document.getElementById('editPlanningNotes').value.trim();
    const startDate = document.getElementById('editPlanningStartDate').value;

    // Basic validation
    if (!articleId || isNaN(quantity) || quantity <= 0 || !startDate) {
        showNotification('Compila tutti i campi obbligatori del lotto.', 'error');
        return;
    }

    // Recalculate delivery details based on new inputs
    const recalculatedDetails = calculateDeliveryDetails(articleId, quantity, priority, notes, type, startDate);

    if (recalculatedDetails) {
        // Ensure the ID is maintained for the update
        recalculatedDetails.id = planId; 
        currentCalculatedPlanningDetails = recalculatedDetails; // Set for savePlanning to pick up
        
        // Call the main savePlanning function to handle update logic
        savePlanning(); 
        document.getElementById('editPlanningModal').classList.remove('show');
        currentEditingId.planning = null; // Reset editing state
        currentCalculatedPlanningDetails = null;
    } else {
        showNotification('Impossibile ricalcolare la pianificazione con le modifiche. Controlla i dati inseriti.', 'error');
    }
}


/**
 * Elimina un elemento dalla pianificazione.
 * @param {number} id L'ID dell'elemento di pianificazione da eliminare.
 */
function deletePlanning(id) {
    const planToDelete = appData.productionPlan.find(p => p.id === id);
    if (planToDelete) {
        // Revert raw material deductions regardless of status (refund or correct)
        revertRawMaterialsForPlan(planToDelete);

        // Remove related journal entries
        appData.warehouseJournal = appData.warehouseJournal.filter(entry => entry.relatedPlanId !== id);
        
        appData.productionPlan = appData.productionPlan.filter(plan => plan.id !== id);
        saveData();
        updateAllTables(); // Explicitly call update after data change
        showNotification('Lotto di pianificazione rimosso e materie prime ripristinate (se ipotetiche).', 'success');
    } else {
        showNotification('Lotto di pianificazione non trovato.', 'error');
    }
}

/**
 * Funzione per riprogrammare un lotto di produzione.
 * @param {number} planId L'ID del lotto da riprogrammare.
 */
function reschedulePlanning(planId) {
    const newStartDate = document.getElementById(`rescheduleDate-${planId}`).value;
    if (!newStartDate) {
        showNotification('Seleziona una nuova data di inizio per riprogrammare.', 'error');
        return;
    }

    const planIndex = appData.productionPlan.findIndex(p => p.id === planId);
    if (planIndex !== -1) {
        const originalPlan = appData.productionPlan[planIndex];
        
        // Re-calculate delivery details with the new start date, preserving other properties
        const recalculatedDetails = calculateDeliveryDetails(
            originalPlan.articleId, 
            originalPlan.quantity, 
            originalPlan.priority, 
            originalPlan.notes,
            originalPlan.type, // Pass type
            newStartDate
        );

        if (recalculatedDetails) {
            // Update only the relevant properties, keep the ID same
            appData.productionPlan[planIndex].startDate = recalculatedDetails.startDate;
            appData.productionPlan[planIndex].estimatedDeliveryDate = recalculatedDetails.estimatedDeliveryDate;
            appData.productionPlan[planIndex].totalDays = recalculatedDetails.totalDays;
            appData.productionPlan[planIndex].detailedSteps = recalculatedDetails.detailedSteps;
            appData.productionPlan[planIndex].bottleneck = recalculatedDetails.bottleneck;

            saveData();
            updateAllTables(); // Explicitly call update after data change
            showNotification(`Lotto ${originalPlan.articleCode} (ID: ${planId}) riprogrammato con successo! Nuova data di consegna: ${new Date(recalculatedDetails.estimatedDeliveryDate).toLocaleDateString('it-IT')}`, 'success');
        } else {
            showNotification('Impossibile riprogrammare il lotto con la nuova data. Controlla i dettagli.', 'error');
        }
    } else {
        showNotification('Lotto di pianificazione non trovato per la riprogrammazione.', 'error');
    }
}


/**
 * Marca un elemento di pianificazione come completato.
 * Non gestisce più il consumo effettivo delle materie prime direttamente qui.
 * @param {number} id L'ID dell'elemento di pianificazione da marcare.
 */
function markPlanningComplete(id) {
    const planIndex = appData.productionPlan.findIndex(plan => plan.id === id);
    if (planIndex !== -1) {
        appData.productionPlan[planIndex].status = 'Completato';
        saveData();
        updateAllTables(); // Explicitly call update after data change
        showNotification('Lotto di pianificazione marcato come completato!', 'success');
        // User is expected to use the journal to update actual consumption
    }
}


// --- IMPORTA PIANI DA JSON ---
/**
 * Importa piani di produzione da un input JSON.
 */
function importPlansFromJson() {
    const jsonString = document.getElementById('jsonImportArea').value.trim();
    if (!jsonString) {
        showNotification('Incolla il testo JSON nella casella.', 'error');
        return;
    }

    let newPlansData;
    try {
        newPlansData = JSON.parse(jsonString);
        if (!Array.isArray(newPlansData)) {
            showNotification('Il JSON deve essere un array di oggetti piano.', 'error');
            return;
        }
    } catch (e) {
        showNotification('Formato JSON non valido. Controlla la sintassi.', 'error');
        console.error('Errore parsing JSON:', e);
        return;
    }

    let plansAddedCount = 0;
    let plansFailedCount = 0;
    const plansToDeduct = []; 

    for (const planData of newPlansData) {
        const articleId = parseInt(planData.articleId);
        const quantity = parseInt(planData.quantity);
        const priority = planData.priority || 'medium';
        const notes = planData.notes || '';
        const type = planData.type || 'production'; // Get type from JSON or default
        const startDateString = planData.startDate;

        const calculatedDetails = calculateDeliveryDetails(articleId, quantity, priority, notes, type, startDateString); // Pass type

        if (calculatedDetails) {
            const article = appData.articles.find(a => a.id === calculatedDetails.articleId);
            if (!article) {
                 showNotification(`Articolo con ID ${articleId} non trovato per l'importazione.`, 'error');
                 plansFailedCount++;
                 continue;
            }

            let materialsCheckPassed = true;
            if (article.bom && article.bom.length > 0) {
                 for (const bomItem of article.bom) {
                    const rawMaterial = appData.rawMaterials.find(rm => rm.id === bomItem.rawMaterialId);
                    const requiredQuantity = bomItem.quantityPerPiece * calculatedDetails.quantity;
                    if (!rawMaterial || rawMaterial.currentStock < requiredQuantity) {
                        materialsCheckPassed = false;
                        const rmName = rawMaterial ? rawMaterial.name : `ID:${bomItem.rawMaterialId}`;
                        console.error(`Materiale "${rmName}" insufficiente per importazione lotto ${article.code} (Qt: ${quantity}). Necessari: ${requiredQuantity.toFixed(2)} ${rawMaterial ? rawMaterial.unit : ''}, Disponibili: ${rawMaterial ? rawMaterial.currentStock.toFixed(2) : '0'}.`);
                        showNotification(`Importazione fallita per lotto ${article.code} (Qt: ${quantity}): Materie prime insufficienti.`, 'error');
                        break;
                    }
                 }
            }

            if (materialsCheckPassed) {
                const newPlan = { ...calculatedDetails, id: Date.now() + Math.random() };
                appData.productionPlan.push(newPlan);
                plansToDeduct.push(newPlan); 
                plansAddedCount++;
            } else {
                plansFailedCount++;
            }
        } else {
            plansFailedCount++;
            console.error(`Importazione fallita per un lotto: Articolo ID ${planData.articleId}, Quantità ${planData.quantity}. Possibile causa: articolo non trovato o ciclo non valido.`);
        }
    }

    plansToDeduct.forEach(plan => {
        deductRawMaterialsForPlan(plan); 
    });

    saveData();
    updateAllTables();
    document.getElementById('jsonImportArea').value = ''; 

    if (plansAddedCount > 0) {
        showNotification(`Importazione completata. Piani aggiunti: ${plansAddedCount}. Piani falliti: ${plansFailedCount}.`, 'success');
    } else if (plansFailedCount > 0) {
        showNotification(`Importazione completata con errori. Piani falliti: ${plansFailedCount}. Controlla la console per i dettagli.`, 'error');
    } else {
        showNotification('Nessun piano valido trovato nel JSON.', 'info');
    }
}


// --- CALENDARIO CONSEGNE ---

/**
 * Naviga alla settimana precedente o successiva nel calendario consegne.
 * @param {number} offset Numero di giorni da aggiungere (es. -7 per settimana prec., +7 per prox).
 */
function navigateDeliveryWeek(offset) {
    const newDate = new Date(appData.currentDeliveryWeekStartDate);
    newDate.setDate(newDate.getDate() + offset);
    appData.currentDeliveryWeekStartDate = getStartOfWeek(newDate); 
    saveData(); 
    updateDeliveryCalendar();
}

/**
 * Aggiorna la vista del calendario consegne.
 */
function updateDeliveryCalendar() {
    const deliveryScheduleDiv = document.getElementById('deliverySchedule');
    deliveryScheduleDiv.innerHTML = ''; 

    const daysOfWeekNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const startOfWeek = new Date(appData.currentDeliveryWeekStartDate.getTime()); 

    const weekDaysToDisplay = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        // Filter out Saturday (6) and Sunday (0)
        if (day.getDay() !== 0 && day.getDay() !== 6) { 
            weekDaysToDisplay.push(day);
        }
    }

    // Ensure grid columns adjust if weekend days are removed
    deliveryScheduleDiv.style.gridTemplateColumns = `repeat(${weekDaysToDisplay.length}, minmax(9.375rem, 1fr))`; // Use rem

    const firstDayFormatted = weekDaysToDisplay.length > 0 ? weekDaysToDisplay[0].toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';
    const lastDayFormatted = weekDaysToDisplay.length > 0 ? weekDaysToDisplay[weekDaysToDisplay.length - 1].toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    document.getElementById('currentDeliveryWeekRange').textContent = `${firstDayFormatted} - ${lastDayFormatted}`;

    const dailyDeliveryMap = new Map(); 

    appData.productionPlan.filter(plan => plan.status !== 'Completato').forEach(plan => {
        const planDeliveryDate = new Date(plan.estimatedDeliveryDate);
        planDeliveryDate.setHours(0, 0, 0, 0);

        const dateString = planDeliveryDate.toISOString().split('T')[0];
        const dayInDisplayWeek = weekDaysToDisplay.find(d => d.toISOString().split('T')[0] === dateString);

        if (dayInDisplayWeek) {
            if (!dailyDeliveryMap.has(dateString)) {
                dailyDeliveryMap.set(dateString, []);
            }
            dailyDeliveryMap.get(dateString).push({
                id: plan.id,
                articleCode: plan.articleCode,
                quantity: plan.quantity,
                priority: plan.priority,
                type: plan.type || 'production' // Include type
            });
        }
    });

    weekDaysToDisplay.forEach(day => {
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        const dayName = daysOfWeekNames[day.getDay()];
        const formattedDate = day.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
        
        dayColumn.innerHTML = `<div class="day-header">${dayName}<br>${formattedDate}</div>`;

        const dateString = day.toISOString().split('T')[0];
        const tasksForDay = dailyDeliveryMap.get(dateString) || [];

        if (tasksForDay.length === 0) {
            dayColumn.innerHTML += '<p style="font-size:0.8em; color:#888; text-align:center; margin-top:0.625rem;">Nessuna consegna</p>'; // Use rem
        } else {
            tasksForDay.forEach(task => {
                const taskDiv = document.createElement('div');
                taskDiv.className = `day-task priority-${task.priority} plan-type-${task.type}`; // Add type class
                taskDiv.innerHTML = `
                    <strong>${task.articleCode}</strong> (Qt: ${task.quantity})<br>
                    <small>${task.type === 'production' ? 'Produzione' : 'Campionatura'}</small>
                `;
                dayColumn.appendChild(taskDiv);
            });
        }
        deliveryScheduleDiv.appendChild(dayColumn);
    });
}


// --- CALENDARIO CARICO DI LAVORO GIORNALIERO ---

/**
 * Naviga alla settimana precedente o successiva nel calendario carico di lavoro.
 * @param {number} offset Numero di giorni da aggiungere.
 */
function navigateWorkloadWeek(offset) {
    const newDate = new Date(appData.currentWorkloadWeekStartDate);
    newDate.setDate(newDate.getDate() + offset);
    appData.currentWorkloadWeekStartDate = getStartOfWeek(newDate);
    saveData();
    updateDailyWorkloadCalendar();
}


/**
 * Aggiorna la vista del calendario carico di lavoro giornaliero per reparto.
 */
function updateDailyWorkloadCalendar() {
    const workloadScheduleDiv = document.getElementById('dailyWorkloadCalendar');
    workloadScheduleDiv.innerHTML = ''; 

    const daysOfWeekNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']; 
    const startOfWeek = new Date(appData.currentWorkloadWeekStartDate.getTime()); 

    const weekDaysToDisplay = [];
    for (let i = 0; i < 7; i++) { 
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        if (day.getDay() !== 0 && day.getDay() !== 6) { 
            weekDaysToDisplay.push(day);
        }
    }
    
    workloadScheduleDiv.style.gridTemplateColumns = `repeat(${weekDaysToDisplay.length}, 1fr)`;

    const firstDayFormatted = weekDaysToDisplay.length > 0 ? weekDaysToDisplay[0].toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';
    const lastDayFormatted = weekDaysToDisplay.length > 0 ? weekDaysToDisplay[weekDaysToDisplay.length - 1].toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    document.getElementById('currentWorkloadWeekRange').textContent = `${firstDayFormatted} - ${lastDayFormatted}`;

    const dailyWorkloadMap = new Map(); 

    weekDaysToDisplay.forEach(day => {
        const dateString = day.toISOString().split('T')[0];
        dailyWorkloadMap.set(dateString, new Map());
        appData.departments.forEach(dept => {
            dailyWorkloadMap.get(dateString).set(dept.name, { totalQty: 0, items: [] });
        });
    });

    appData.productionPlan.filter(plan => plan.status !== 'Completato').forEach(plan => {
        const lotStartDate = new Date(plan.startDate);
        lotStartDate.setHours(0, 0, 0, 0);

        for (let workingDayOffset = 0; workingDayOffset < plan.totalDays; workingDayOffset++) {
            const calendarDate = addWorkingDays(new Date(lotStartDate.getTime()), workingDayOffset);
            calendarDate.setHours(0, 0, 0, 0); 

            const dateString = calendarDate.toISOString().split('T')[0];

            const isWithinDisplayedWeek = weekDaysToDisplay.some(d => d.toISOString().split('T')[0] === dateString);

            if (isWithinDisplayedWeek) {
                const activeStep = plan.detailedSteps.find(step =>
                    workingDayOffset >= step.stepStartWorkingDayOffset &&
                    workingDayOffset < step.stepEndWorkingDayOffset
                );

                if (activeStep) {
                    const department = appData.departments.find(dept =>
                        dept.phaseIds.includes(activeStep.phaseId) &&
                        dept.machineTypes.includes(activeStep.machineType) &&
                        (activeStep.fineness === 0 || dept.finenesses.includes(activeStep.fineness))
                    );

                    if (department) {
                        const dailyQuantityForStep = plan.quantity / activeStep.calculatedDays; 

                        const deptWorkload = dailyWorkloadMap.get(dateString).get(department.name);
                        deptWorkload.totalQty += dailyQuantityForStep;
                        deptWorkload.items.push({
                            articleCode: plan.articleCode,
                            quantity: dailyQuantityForStep,
                            phaseName: activeStep.phase,
                            machineType: activeStep.machineType,
                            fineness: activeStep.fineness,
                            type: plan.type || 'production' // Include type
                        });
                    }
                }
            }
        }
    });

    weekDaysToDisplay.forEach(day => {
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        const dayName = daysOfWeekNames[day.getDay()]; 
        const formattedDate = day.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
        
        dayColumn.innerHTML = `<div class="day-header">${dayName}<br>${formattedDate}</div>`;

        const dateString = day.toISOString().split('T')[0];
        const dailyDataForDay = dailyWorkloadMap.get(dateString);

        if (dailyDataForDay) {
            let hasContent = false;
            appData.departments.forEach(dept => {
                const deptWorkload = dailyDataForDay.get(dept.name);
                if (deptWorkload && deptWorkload.totalQty > 0) {
                    hasContent = true;
                    const deptDiv = document.createElement('div');
                    deptDiv.className = 'daily-workload-department';
                    deptDiv.innerHTML = `
                        <h5>${dept.name} (Tot: ${deptWorkload.totalQty.toFixed(0)} pz)</h5>
                    `;
                    deptWorkload.items.sort((a,b) => a.articleCode.localeCompare(b.articleCode)).forEach(item => {
                        const detailDiv = document.createElement('div');
                        detailDiv.className = `daily-workload-detail plan-type-${item.type}`; // Add type class
                        detailDiv.innerHTML = `
                            <strong>${item.articleCode}</strong>: ${item.phaseName} (${item.machineType} F${item.fineness.toFixed(0)})<br>
                            Qt: ${item.quantity.toFixed(0)} pz
                        `;
                        deptDiv.appendChild(detailDiv);
                    });
                    dayColumn.appendChild(deptDiv);
                }
            });
            if (!hasContent) {
                dayColumn.innerHTML += '<p style="font-size:0.8em; color:#888; text-align:center; margin-top:0.625rem;">Nessun carico</p>'; // Use rem
            }
        } else {
            dayColumn.innerHTML += '<p style="font-size:0.8em; color:#888; text-align:center; margin-top:0.625rem;">Nessun carico</p>'; // Use rem
        }
        workloadScheduleDiv.appendChild(dayColumn);
    });
}


// --- DASHBOARD ---

/**
 * Aggiorna i dati mostrati nella dashboard.
 */
function updateDashboard() {
    // Statistiche Generali
    const generalStatsDiv = document.getElementById('generalStats');
    const totalPhases = appData.phases.length;
    const totalMachines = appData.machines.length;
    const totalDepartments = appData.departments.length;
    const totalRawMaterials = appData.rawMaterials.length;
    const totalArticles = appData.articles.length;
    const totalPlannedLots = appData.productionPlan.length;
    const completedLots = appData.productionPlan.filter(p => p.status === 'Completato').length;

    generalStatsDiv.innerHTML = `
        <p><strong>Fasi di Lavorazione Registrate:</strong> ${totalPhases}</p>
        <p><strong>Macchinari Registrati:</strong> ${totalMachines}</p>
        <p><strong>Reparti Registrati:</strong> ${totalDepartments}</p>
        <p><strong>Materie Prime Registrate:</strong> ${totalRawMaterials}</p>
        <p><strong>Articoli Registrati:</strong> ${totalArticles}</p>
        <p><strong>Lotti Pianificati Totalmente:</strong> ${totalPlannedLots}</p>
        <p><strong>Lotti Completati:</strong> ${completedLots}</p>
        <p><strong>Lotti In Attesa:</strong> ${totalPlannedLots - completedLots}</p>
    `;

    // Utilizzo Macchinari (placeholder, richiederebbe una logica di allocazione più complessa)
    const machineStatsDiv = document.getElementById('machineStats');
    machineStatsDiv.innerHTML = '';
    if (appData.machines.length === 0) {
        machineStatsDiv.innerHTML = '<p>Nessun macchinario registrato.</p>';
    } else {
        appData.machines.forEach(machine => {
            const currentLoad = 0; 
            const usagePercentage = machine.capacity > 0 ? Math.round((currentLoad / machine.capacity) * 100) : 0;
            machineStatsDiv.innerHTML += `
                <p><strong>${machine.name} (F${machine.fineness}):</strong></p>
                <div class="machine-usage">
                    <div class="machine-usage-bar" style="width: ${usagePercentage}%"></div>
                </div>
                <p>${usagePercentage}% Utilizzo (Capacità: ${machine.capacity} pz/giorno)</p>
                <hr style="margin: 0.625rem 0; border: none; border-top: 0.0625rem dashed #eee;">
            `; // Use rem
        });
    }

    // Prossime Consegne
    const upcomingDeliveriesDiv = document.getElementById('upcomingDeliveries');
    upcomingDeliveriesDiv.innerHTML = '';
    const upcoming = appData.productionPlan
        .filter(p => p.status !== 'Completato')
        .sort((a, b) => new Date(a.estimatedDeliveryDate) - new Date(b.estimatedDeliveryDate))
        .slice(0, 5); 

    if (upcoming.length === 0) {
        upcomingDeliveriesDiv.innerHTML = '<p>Nessuna prossima consegna in programma.</p>';
    } else {
        upcoming.forEach(plan => {
            const article = appData.articles.find(a => a.id === plan.articleId);
            const formattedDate = new Date(plan.estimatedDeliveryDate).toLocaleDateString('it-IT');
            upcomingDeliveriesDiv.innerHTML += `
                <p><strong>${article ? article.code : 'N/A'}</strong> (Qt: ${plan.quantity})</p>
                <p>Previsto per: ${formattedDate}</p>
                <hr style="margin: 0.5rem 0; border: none; border-top: 0.0625rem dotted #ccc;">
            `; // Use rem
        });
    }

    // Carico di Lavoro (Placeholder - richiederebbe una libreria di grafici come Chart.js)
    const workloadChartDiv = document.getElementById('workloadChart');
    workloadChartDiv.innerHTML = '<p>Grafico del carico di lavoro (richiede libreria esterna per la visualizzazione).</p>';
}

/**
 * Esporta i dati dell'applicazione come file JSON.
 */
function exportDataAsJson() {
    const dataStr = JSON.stringify(appData, null, 2); // Pretty print JSON
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'magliflex_data_backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Dati esportati con successo!', 'success');
}

/**
 * Importa i dati nell'applicazione da un file JSON.
 * @param {Event} event L'evento di cambio del file input.
 */
function importDataFromJson(event) {
    const file = event.target.files[0];
    if (!file) {
        showNotification('Nessun file selezionato.', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            // Basic validation: Check if essential top-level keys exist
            if (
                importedData.phases && Array.isArray(importedData.phases) &&
                importedData.machines && Array.isArray(importedData.machines) &&
                importedData.departments && Array.isArray(importedData.departments) &&
                importedData.rawMaterials && Array.isArray(importedData.rawMaterials) &&
                importedData.warehouseJournal && Array.isArray(importedData.warehouseJournal) &&
                importedData.articles && Array.isArray(importedData.articles) &&
                importedData.productionPlan && Array.isArray(importedData.productionPlan) &&
                importedData.notifications && Array.isArray(importedData.notifications)
            ) {
                // Clear current app data and load new data
                appData = importedData;
                
                // Convert date strings back to Date objects where necessary
                if (appData.currentDeliveryWeekStartDate) appData.currentDeliveryWeekStartDate = new Date(appData.currentDeliveryWeekStartDate);
                if (appData.currentWorkloadWeekStartDate) appData.currentWorkloadWeekStartDate = new Date(appData.currentWorkloadWeekStartDate);
                appData.productionPlan.forEach(plan => {
                    if (typeof plan.startDate === 'string') plan.startDate = new Date(plan.startDate);
                    if (typeof plan.estimatedDeliveryDate === 'string') plan.estimatedDeliveryDate = new Date(plan.estimatedDeliveryDate);
                });
                appData.warehouseJournal.forEach(entry => {
                    if (typeof entry.date === 'string') entry.date = new Date(entry.date);
                });


                saveData(); // Save imported data to localStorage
                updateAllTables(); // Refresh UI with new data
                showNotification('Dati importati con successo! L\'applicazione è stata aggiornata con i nuovi dati.', 'success');
                // Optional: Reload the page to ensure all components refresh correctly with new data
                // window.location.reload(); 
            } else {
                showNotification('Formato dati JSON importato non valido. Assicurati che sia un file di backup di MagliFlex.', 'error');
            }
        } catch (error) {
            console.error('Errore durante l\'importazione del file:', error);
            showNotification('Errore durante la lettura o il parsing del file JSON. Assicurati che il file sia valido.', 'error');
        }
    };
    reader.readAsText(file);
    // Clear the file input after reading
    event.target.value = '';
}


// --- Funzioni di Login/Logout ---

/**
 * Gestisce il processo di login dell'utente.
 */
function loginUser() {
    const usernameInput = document.getElementById('usernameInput');
    const username = usernameInput.value.trim();

    if (username) {
        currentUser = username;
        localStorage.setItem('magliflex-currentUser', currentUser);
        document.getElementById('loginOverlay').classList.remove('show');
        document.getElementById('appContent').style.display = 'block';
        loadAndInitializeAppData(); // Load data AFTER successful login
        showNotification(`Benvenuto, ${currentUser}!`, 'success');
    } else {
        showNotification('Per favore, inserisci un nome utente.', 'warning');
    }
}

/**
 * Gestisce il processo di logout dell'utente.
 */
function logoutUser() {
    currentUser = null;
    localStorage.removeItem('magliflex-currentUser');
    // Clear all app data to ensure a fresh start for the next user
    localStorage.removeItem('magliflex-data'); 
    resetAppDataToDefaultsAndAddExamples(); // Re-initialize with default/example data

    document.getElementById('appContent').style.display = 'none';
    document.getElementById('loginOverlay').classList.add('show');
    document.getElementById('usernameInput').value = ''; // Clear username input
    showNotification('Logout effettuato con successo.', 'info');
}
