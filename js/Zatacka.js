"use strict";

const Zatacka = ((window, document) => {

    const canvas_main = byID("canvas_main");
    const canvas_overlay = byID("canvas_overlay");
    const ORIGINAL_WIDTH = canvas_main.width;
    const ORIGINAL_HEIGHT = canvas_main.height;
    const TOTAL_BORDER_THICKNESS = 4;

    const config = Object.freeze({
        tickrate: 600, // Hz
        maxFramerate: 300, // Hz
        canvas: canvas_main,
        thickness: 3, // Kuxels
        speed: 60, // Kuxels per second
        turningRadius: 28.5, // Kuxels (NB: _radius_)
        minSpawnAngle: -Math.PI/2, // radians
        maxSpawnAngle:  Math.PI/2, // radians
        spawnMargin: 100, // Kuxels
        flickerFrequency: 20, // Hz, when spawning
        flickerDuration: 830, // ms, when spawning
        minHoleInterval: 90, // Kuxels
        maxHoleInterval: 300, // Kuxels
        minHoleSize: 5, // Kuxels
        maxHoleSize: 9, // Kuxels
        hintDelay: 3000, // ms
        keys: {
            "proceed": [KEY.SPACE, KEY.ENTER],
            "quit":    [KEY.ESCAPE]
        },
        messages: Object.freeze({
            pick:    new InfoMessage(TEXT.hint_pick),
            proceed: new InfoMessage(TEXT.hint_proceed),
            next:    new InfoMessage(TEXT.hint_next),
            quit:    new InfoMessage(TEXT.hint_quit),
            alt:     new WarningMessage(TEXT.hint_alt),
            ctrl:    new WarningMessage(TEXT.hint_ctrl),
            mouse:   new WarningMessage(TEXT.hint_mouse),
            preferences_access_denied: new WarningMessage(TEXT.hint_preferences_access_denied),
        }),
        defaultPlayers: Object.freeze([
            { id: 1, name: "Red"   , color: "#FF2800", keyL: KEY["1"]                              , keyR: KEY.Q                         },
            { id: 2, name: "Yellow", color: "#C3C300", keyL: [ KEY.CTRL, KEY.Z ]                   , keyR: [ KEY.ALT, KEY.X ]            },
            { id: 3, name: "Orange", color: "#FF7900", keyL: KEY.M                                 , keyR: KEY.COMMA                     },
            { id: 4, name: "Green" , color: "#00CB00", keyL: KEY.LEFT_ARROW                        , keyR: KEY.DOWN_ARROW                },
            { id: 5, name: "Pink"  , color: "#DF51B6", keyL: [ KEY.DIVIDE, KEY.END, KEY.PAGE_DOWN ], keyR: [ KEY.MULTIPLY, KEY.PAGE_UP ] },
            { id: 6, name: "Blue"  , color: "#00A2CB", keyL: MOUSE.LEFT                            , keyR: MOUSE.RIGHT                   }
        ])
    });

    const PREFERENCES = Object.freeze([
        // {
        //     type: BooleanPreference,
        //     key: STRINGS.pref_key_prevent_spawnkill,
        //     label: TEXT.pref_label_prevent_spawnkill,
        //     description: TEXT.pref_label_description_prevent_spawnkill,
        //     default: true,
        // },
        {
            type: MultichoicePreference,
            key: STRINGS.pref_key_cursor,
            label: TEXT.pref_label_cursor,
            description: TEXT.pref_label_description_cursor,
            values: [
                STRINGS.pref_value_cursor_always_visible,
                STRINGS.pref_value_cursor_hidden_when_mouse_used_by_player,
                STRINGS.pref_value_cursor_always_hidden,
            ],
            labels: [
                TEXT.pref_label_cursor_always_visible,
                TEXT.pref_label_cursor_hidden_when_mouse_used_by_player,
                TEXT.pref_label_cursor_always_hidden,
            ],
            default: STRINGS.pref_value_cursor_hidden_when_mouse_used_by_player,
        },
        {
            type: MultichoicePreference,
            key: STRINGS.pref_key_edge_fix,
            label: TEXT.pref_label_edge_fix,
            description: TEXT.pref_label_description_edge_fix,
            values: [
                STRINGS.pref_value_edge_fix_full,
                STRINGS.pref_value_edge_fix_minimal,
                STRINGS.pref_value_edge_fix_off,
            ],
            labels: [
                TEXT.pref_label_edge_fix_full,
                TEXT.pref_label_edge_fix_minimal,
                TEXT.pref_label_edge_fix_off,
            ],
            default: STRINGS.pref_value_edge_fix_off,
        },
        {
            type: MultichoicePreference,
            key: STRINGS.pref_key_hints,
            label: TEXT.pref_label_hints,
            description: TEXT.pref_label_description_hints,
            values: [
                STRINGS.pref_value_hints_all,
                STRINGS.pref_value_hints_warnings_only,
                STRINGS.pref_value_hints_none,
            ],
            labels: [
                TEXT.pref_label_hints_all,
                TEXT.pref_label_hints_warnings_only,
                TEXT.pref_label_hints_none,
            ],
            default: STRINGS.pref_value_hints_all,
        }
    ]);

    const preferenceManager = new PreferenceManager(PREFERENCES);

    function isProceedKey(key) {
        return config.keys.proceed.includes(key);
    }

    function isQuitKey(key) {
        return config.keys.quit.includes(key);
    }

    function shouldPreventDefault(key) {
        return !isFKey(key);
    }

    function setEdgePadding(padding) {
        if (game.isStarted()) {
            throw new Error("Cannot change edge padding when the game is running.");
        } else {
            const newCanvasWidth = ORIGINAL_WIDTH - padding;
            const newCanvasHeight = ORIGINAL_HEIGHT - 2*padding;
            game.setSize(newCanvasWidth, newCanvasHeight);
            guiController.setEdgePadding(padding);
        }
    }

    function setEdgeMode(mode) {
        let padding = 0;
        if (mode === "minimal") {
            padding = 1;
        } else if (mode === "full") {
            padding = TOTAL_BORDER_THICKNESS;
        }
        try {
            setEdgePadding(padding);
        } catch(e) {
            logError(e);
        }
    }

    function getHoleConfig() {
        return {
            minHoleSize: config.minHoleSize,
            maxHoleSize: config.maxHoleSize,
            minHoleInterval: config.minHoleInterval,
            maxHoleInterval: config.maxHoleInterval
        };
    }

    function getPaddedHoleConfig() {
        const thickness = config.thickness;
        const holeConfig = getHoleConfig();
        const paddedHoleConfig = {};
        paddedHoleConfig.minPaddedHoleSize = holeConfig.minHoleSize + thickness;
        paddedHoleConfig.maxPaddedHoleSize = holeConfig.maxHoleSize + thickness;
        paddedHoleConfig.minPaddedHoleInterval = Math.max(0, holeConfig.minHoleInterval - thickness);
        paddedHoleConfig.maxPaddedHoleInterval = Math.max(0, holeConfig.maxHoleInterval - thickness);
        return paddedHoleConfig;
    }

    function defaultPlayerData(id) {
        return config.defaultPlayers.find(defaultPlayer => defaultPlayer.id === id);
    }

    function defaultPlayer(id) {
        const playerData = defaultPlayerData(id);
        if (playerData === undefined) {
            throw new TypeError(`There is no default player with ID ${id}.`);
        }
        return new Player(playerData.id,
                          playerData.name,
                          playerData.color,
                          playerData.keyL,
                          playerData.keyR,
                          getPaddedHoleConfig());
    }

    function applyCursorBehavior() {
        const mouseIsBeingUsed = game.getPlayers().some(hasMouseButton);
        let behavior;
        switch (preferenceManager.getCached(STRINGS.pref_key_cursor)) {
            case STRINGS.pref_value_cursor_hidden_when_mouse_used_by_player:
                behavior = mouseIsBeingUsed ? STRINGS.cursor_hidden : STRINGS.cursor_visible;
                break;
            case STRINGS.pref_value_cursor_always_hidden:
                behavior = STRINGS.cursor_hidden;
                break;
            default:
                behavior = STRINGS.cursor_visible;
        }
        log(`Setting cursor behavior to ${behavior}.`);
        guiController.setCursorBehavior(behavior);
    }

    function proceedKeyPressedInLobby() {
        const numberOfReadyPlayers = game.getNumberOfPlayers();
        if (numberOfReadyPlayers > 0) {
            clearMessages();
            removeLobbyEventListeners();
            addGameEventListeners();
            applyCursorBehavior();
            game.setMode(numberOfReadyPlayers === 1 ? Game.PRACTICE : Game.COMPETITIVE);
            game.start();
        }
    }

    function hasMouseButton(player) {
        return player.usesAnyMouseButton();
    }

    function checkForDangerousInput() {
        if (game.getPlayers().some((player) => player.hasKey(KEY.CTRL))) {
            guiController.showMessage(config.messages.ctrl);
        } else {
            guiController.hideMessage(config.messages.ctrl);
        }

        if (game.getPlayers().some((player) => player.hasKey(KEY.ALT))) {
            guiController.showMessage(config.messages.alt);
        } else {
            guiController.hideMessage(config.messages.alt);
        }

        if (game.getPlayers().some(hasMouseButton)) {
            guiController.showMessage(config.messages.mouse);
        } else {
            guiController.hideMessage(config.messages.mouse);
        }
    }

    function addPlayer(id) {
        game.addPlayer(defaultPlayer(id));
        checkForDangerousInput();
        clearTimeout(hintPickTimer);
        guiController.hideMessage(config.messages.pick);
        clearTimeout(hintProceedTimer);
        hintProceedTimer = setTimeout(() => {
            guiController.showMessage(config.messages.proceed);
        }, config.hintDelay);
    }

    function removePlayer(id) {
        game.removePlayer(id);
        checkForDangerousInput();
        clearTimeout(hintProceedTimer);
        if (game.getNumberOfPlayers() === 0) {
            guiController.hideMessage(config.messages.proceed);
        } else {
            hintProceedTimer = setTimeout(() => {
                guiController.showMessage(config.messages.proceed);
            }, config.hintDelay);
        }
    }

    function defaultPlayerHasLeftKey(playerData, pressedKey) {
        return pressedKey === playerData.keyL || (playerData.keyL instanceof Array && playerData.keyL.includes(pressedKey));
    }

    function defaultPlayerHasRightKey(playerData, pressedKey) {
        return pressedKey === playerData.keyR || (playerData.keyR instanceof Array && playerData.keyR.includes(pressedKey));
    }

    function addOrRemovePlayer(playerData, pressedKey) {
        if (defaultPlayerHasLeftKey(playerData, pressedKey)) {
            addPlayer(playerData.id);
        } else if (defaultPlayerHasRightKey(playerData, pressedKey)) {
            removePlayer(playerData.id);
        }
    }

    function eventConsumer(event) {
        event.stopPropagation();
    }

    function keyPressedInLobby(pressedKey) {
        config.defaultPlayers.forEach((playerData) => {
            addOrRemovePlayer(playerData, pressedKey);
        });
    }

    function mouseClickedInLobby(button) {
        config.defaultPlayers.forEach((playerData) => {
            addOrRemovePlayer(playerData, MOUSE.pack(button));
        });
    }

    function lobbyKeyHandler(event) {
        const pressedKey = event.keyCode;
        if (shouldPreventDefault(pressedKey)) {
            event.preventDefault();
        }
        if (isProceedKey(pressedKey)) {
            proceedKeyPressedInLobby();
        } else {
            keyPressedInLobby(pressedKey);
        }
    }

    function lobbyMouseHandler(event) {
        event.preventDefault();
        mouseClickedInLobby(event.button);
    }

    function quitGame() {
        removeGameEventListeners();
        addLobbyEventListeners();
        game.quit();
        guiController.gameQuit();
        game = newGame();
    }

    function gameKeyHandler(event) {
        const pressedKey = event.keyCode;
        if (shouldPreventDefault(pressedKey)) {
            event.preventDefault();
        }
        if (isProceedKey(pressedKey)) {
            if (game.shouldQuitOnProceedKey()) {
                quitGame();
            } else {
                game.proceedKeyPressed();
            }
        } else if (isQuitKey(pressedKey) && game.shouldQuitOnQuitKey()) {
            quitGame();
        }
    }

    function gameMouseHandler(event) {
        event.preventDefault();
    }

    function gameUnloadHandler(event) {
        // A simple trick to prevent accidental unloading of the entire game.
        const message = TEXT.hint_unload;
        event.returnValue = message; // Gecko, Trident, Chrome 34+
        return TEXT.hint_unload;     // Gecko, Webkit, Chrome <34
    }

    function settingsKeyHandler(event) {
        const pressedKey = event.keyCode;
        if (isQuitKey(pressedKey)) {
            hideSettings();
        }
    }

    function showSettings() {
        clearTimeout(hintPickTimer);
        clearTimeout(hintProceedTimer);
        try {
            guiController.updateSettingsForm(preferenceManager.getAllPreferencesWithValues());
        } catch(e) {
            guiController.updateSettingsForm(preferenceManager.getAllPreferencesWithDefaultValues());
            handleSettingsAccessError(e);
        }
        removeLobbyEventListeners();
        addHideSettingsButtonEventListener();
        document.addEventListener("keydown", settingsKeyHandler);
        guiController.showSettings();
    }

    function hideSettings() {
        document.removeEventListener("keydown", settingsKeyHandler);
        addLobbyEventListeners();
        guiController.parseSettingsForm().forEach((newSetting) => {
            try {
                preferenceManager.set(newSetting.key, newSetting.value);
            } catch(e) {
                handleSettingsAccessError(e);
            }
        });
        applySettings();
        guiController.hideSettings();
    }

    function applySettings() {
        try {
            // Edge fix:
            setEdgeMode(preferenceManager.get(STRINGS.pref_key_edge_fix));
            // Hints:
            guiController.setMessageMode(preferenceManager.get(STRINGS.pref_key_hints));
        } catch(e) {
            setEdgeMode(preferenceManager.getCached(STRINGS.pref_key_edge_fix));
            guiController.setMessageMode(preferenceManager.getCached(STRINGS.pref_key_hints));
            handleSettingsAccessError(e);
        }
    }

    function handleSettingsAccessError(error) {
        if (error.name === STRINGS.error_name_security) {
            guiController.showMessage(config.messages.preferences_access_denied);
        }
    }

    function clearMessages() {
        clearTimeout(hintPickTimer);
        clearTimeout(hintProceedTimer);
        guiController.clearMessages();
    }

    function addShowSettingsButtonEventListener() {
        const showSettingsButton = byID("button-show-settings");
        if (showSettingsButton instanceof HTMLElement) {
            showSettingsButton.addEventListener("mousedown", eventConsumer);
            showSettingsButton.addEventListener("click", showSettings);
        }
    }

    function addHideSettingsButtonEventListener() {
        const hideSettingsButton = byID("button-hide-settings");
        if (hideSettingsButton instanceof HTMLElement) {
            hideSettingsButton.addEventListener("mousedown", eventConsumer);
            hideSettingsButton.addEventListener("click", hideSettings);
        }
    }

    function removeShowSettingsButtonEventListener() {
        const showSettingsButton = byID("button-show-settings");
        if (showSettingsButton instanceof HTMLElement) {
            showSettingsButton.removeEventListener("mousedown", eventConsumer);
            showSettingsButton.removeEventListener("click", showSettings);
        }
    }

    function addLobbyEventListeners() {
        log("Adding lobby event listeners ...");
        addShowSettingsButtonEventListener();
        document.addEventListener("keydown", lobbyKeyHandler);
        document.addEventListener("mousedown", lobbyMouseHandler);
        document.addEventListener("contextmenu", lobbyMouseHandler);
        log("Done.");
    }

    function removeLobbyEventListeners() {
        log("Removing lobby event listeners ...");
        removeShowSettingsButtonEventListener();
        document.removeEventListener("keydown", lobbyKeyHandler);
        document.removeEventListener("mousedown", lobbyMouseHandler);
        document.removeEventListener("contextmenu", lobbyMouseHandler);
        log("Done.");
    }

    function addGameEventListeners() {
        log("Adding game event listeners ...");
        document.addEventListener("keydown", Keyboard.onKeydown.bind(Keyboard));
        document.addEventListener("keyup", Keyboard.onKeyup.bind(Keyboard));
        document.addEventListener("mousedown", Mouse.onMousedown.bind(Mouse));
        document.addEventListener("mouseup", Mouse.onMouseup.bind(Mouse));
        document.addEventListener("keydown", gameKeyHandler);
        document.addEventListener("mousedown", gameMouseHandler);
        document.addEventListener("contextmenu", gameMouseHandler);
        window.addEventListener("beforeunload", gameUnloadHandler);
        log("Done.");
    }

    function removeGameEventListeners() {
        log("Removing game event listeners ...");
        document.removeEventListener("keydown", gameKeyHandler);
        document.removeEventListener("mousedown", gameMouseHandler);
        window.removeEventListener("beforeunload", gameUnloadHandler);
        log("Done.");
    }

    addLobbyEventListeners();

    function newGame() {
        return new Game(config, Renderer(canvas_main, canvas_overlay), guiController);
    }

    const guiController = GUIController(config);
    let game = newGame();

    let hintProceedTimer;
    let hintPickTimer = setTimeout(() => {
        guiController.showMessage(config.messages.pick);
    }, config.hintDelay);

    applySettings();

    return {
        getConfig: () => config,
        getGame: () => game,
        addPlayer: (playerOrID) => {
            const player = Player.isPlayer(playerOrID) ? playerOrID : new Player(playerOrID);
            game.addPlayer(player);
        }
    };

})(window, document);
