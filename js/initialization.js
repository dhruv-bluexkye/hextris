// Flutter integration variables
var poolId = null;
var sessionId = null;
var authToken = null;
var gameStartTime = null;
var gameTimerDuration = 15; // Default timer duration in seconds
var apiServerUrl = 'https://api.metaninza.net'; // Default API server URL
var sessionReady = false; // Track if session parameters are ready
var scoreSubmitting = false; // Track if score is being submitted
var scoreSubmissionComplete = false; // Track if score submission is complete

// Get URL parameters for Flutter integration (fallback method)
function getUrlParameter(name) {
	name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
	var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
	var results = regex.exec(location.search);
	return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Initialize Flutter parameters - priority: window.__GAME_SESSION__ > URL params > postMessage
function initFlutterParams() {
	// Request Flutter for parameters if not available
	if (!window.__GAME_SESSION__ && !sessionId && !authToken) {
		console.log('Requesting Flutter for session parameters...');
		// Try to request via postMessage
		if (window.parent && window.parent !== window) {
			window.parent.postMessage({ type: 'requestSessionParams' }, '*');
		} else if (window.flutter_inappwebview) {
			window.flutter_inappwebview.callHandler('requestSessionParams');
		}
	}
	
	// First, try to get from window.__GAME_SESSION__ (Flutter InAppWebView injection)
	if (window.__GAME_SESSION__) {
		sessionId = window.__GAME_SESSION__.sessionId;
		authToken = window.__GAME_SESSION__.token;
		
		// Check if session has expired
		if (window.__GAME_SESSION__.expiresAt && Date.now() > window.__GAME_SESSION__.expiresAt) {
			console.warn('Game session has expired');
			sessionId = null;
			authToken = null;
		}
		
		// poolId might be in the session object or URL
		if (window.__GAME_SESSION__.poolId) {
			poolId = window.__GAME_SESSION__.poolId;
		} else {
			poolId = getUrlParameter('poolId');
		}
		
		// Get timer duration from Flutter (in seconds)
		if (window.__GAME_SESSION__.timerDuration !== undefined) {
			gameTimerDuration = parseInt(window.__GAME_SESSION__.timerDuration) || 15;
		} else if (window.__GAME_SESSION__.timer !== undefined) {
			gameTimerDuration = parseInt(window.__GAME_SESSION__.timer) || 15;
		}
		
		// Get API server URL from Flutter
		if (window.__GAME_SESSION__.apiServerUrl) {
			apiServerUrl = window.__GAME_SESSION__.apiServerUrl;
		} else if (window.__GAME_SESSION__.apiServer) {
			apiServerUrl = window.__GAME_SESSION__.apiServer;
		}
	} else {
		// Fallback to URL parameters
		poolId = getUrlParameter('poolId');
		sessionId = getUrlParameter('sessionId');
		authToken = getUrlParameter('authToken');
		
		// Get timer from URL parameter if available
		var urlTimer = getUrlParameter('timer');
		if (urlTimer) {
			gameTimerDuration = parseInt(urlTimer) || 15;
		}
		
		// Get API server URL from URL parameter if available
		var urlApiServer = getUrlParameter('apiServerUrl') || getUrlParameter('apiServer');
		if (urlApiServer) {
			apiServerUrl = urlApiServer;
		}
	}
	
	// Also listen for postMessage if embedded (additional fallback)
	if (window.parent && window.parent !== window) {
		window.addEventListener('message', function(event) {
			if (event.data && event.data.type === 'flutterParams') {
				poolId = event.data.poolId || poolId;
				sessionId = event.data.sessionId || sessionId;
				authToken = event.data.authToken || authToken;
				if (event.data.timerDuration) {
					gameTimerDuration = parseInt(event.data.timerDuration) || 15;
				}
				if (event.data.apiServerUrl || event.data.apiServer) {
					apiServerUrl = event.data.apiServerUrl || event.data.apiServer;
				}
				// Update session ready flag
				if (sessionId && authToken) {
					sessionReady = true;
					// Show play button if on start screen
					if (gameState === 0) {
						$('#startBtn').fadeIn();
					}
				}
			}
		});
	}
	
	// Debug mode: Allow setting session via URL parameter for testing
	var debugMode = getUrlParameter('debug') === 'true';
	if (debugMode && !sessionId && !authToken) {
		// For testing: allow setting via URL parameters when debug=true
		poolId = getUrlParameter('poolId') || poolId || 'test-pool-123';
		sessionId = getUrlParameter('sessionId') || sessionId || 'test-session-456';
		authToken = getUrlParameter('authToken') || authToken || 'test-token-789';
		console.log('DEBUG MODE: Using test parameters');
	}
	
	// Update session ready flag
	if (sessionId && authToken) {
		sessionReady = true;
		console.log('Flutter session initialized successfully', {
			poolId: poolId,
			sessionId: sessionId,
			timerDuration: gameTimerDuration,
			apiServerUrl: apiServerUrl
		});
	} else {
		sessionReady = false;
		console.log('Flutter session parameters not found - waiting for session...');
	}
}

// Send message to Flutter app to close window
function closeFlutterWindow() {
	if (window.parent && window.parent !== window) {
		// If in iframe, send message to parent
		window.parent.postMessage({ type: 'closeGame' }, '*');
	} else if (window.flutter_inappwebview) {
		// If using Flutter InAppWebView
		window.flutter_inappwebview.callHandler('closeGame');
	} else {
		// Fallback: try to close window
		window.close();
	}
}

// Send message to Flutter app (for API responses, errors, etc.)
function sendMessageToFlutter(type, data) {
	var message = {
		type: type,
		data: data
	};
	
	if (window.parent && window.parent !== window) {
		// If in iframe, send message to parent
		window.parent.postMessage(message, '*');
	} else if (window.flutter_inappwebview) {
		// If using Flutter InAppWebView
		window.flutter_inappwebview.callHandler('onMessage', message);
	} else {
		console.log('Flutter message:', message);
	}
}

// Function to check session and update UI
function checkSessionAndUpdateUI() {
	var wasReady = sessionReady;
	initFlutterParams();
	
	// If session just became ready, show the play button
	if (sessionReady && !wasReady && gameState === 0) {
		$('#startBtn').fadeIn();
	}
	
	// If session is not ready, keep checking periodically
	if (!sessionReady) {
		setTimeout(checkSessionAndUpdateUI, 500);
	}
}

$(document).ready(function() {
	initFlutterParams();
	
	// Also check for session after a short delay (in case it's injected after page load)
	setTimeout(function() {
		checkSessionAndUpdateUI();
	}, 100);
	
	// Also check on window load event
	$(window).on('load', function() {
		checkSessionAndUpdateUI();
	});
	
	// Start periodic checking if session not ready
	if (!sessionReady) {
		setTimeout(checkSessionAndUpdateUI, 500);
	}
	
	// Re-check on visibility change (in case Flutter injects params when page becomes visible)
	document.addEventListener('visibilitychange', function() {
		if (!document.hidden) {
			checkSessionAndUpdateUI();
		}
	});
	
	// Also listen for focus events
	window.addEventListener('focus', function() {
		checkSessionAndUpdateUI();
	});
	
	initialize();
});

// Function to manually re-initialize session (can be called from external scripts)
function reinitFlutterSession() {
	initFlutterParams();
	if (sessionId && authToken) {
		console.log('Session re-initialized successfully');
		return true;
	}
	return false;
}
function initialize(a) {
	window.rush = 1;
	window.lastTime = Date.now();
	window.iframHasLoaded = false;
	window.colors = ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71"];
	window.hexColorsToTintedColors = {
		"#e74c3c": "rgb(241,163,155)",
		"#f1c40f": "rgb(246,223,133)",
		"#3498db": "rgb(151,201,235)",
		"#2ecc71": "rgb(150,227,183)"
	};

	window.rgbToHex = {
		"rgb(231,76,60)": "#e74c3c",
		"rgb(241,196,15)": "#f1c40f",
		"rgb(52,152,219)": "#3498db",
		"rgb(46,204,113)": "#2ecc71"
	};

	window.rgbColorsToTintedColors = {
		"rgb(231,76,60)": "rgb(241,163,155)",
		"rgb(241,196,15)": "rgb(246,223,133)",
		"rgb(52,152,219)": "rgb(151,201,235)",
		"rgb(46,204,113)": "rgb(150,227,183)"
	};

	window.hexagonBackgroundColor = 'rgb(236, 240, 241)';
	window.hexagonBackgroundColorClear = 'rgba(236, 240, 241, 0.5)';
	window.centerBlue = 'rgb(44,62,80)';
	window.angularVelocityConst = 4;
	window.scoreOpacity = 0;
	window.textOpacity = 0;
	window.prevGameState = undefined;
	window.op = 0;
	window.saveState = localStorage.getItem("saveState") || "{}";
	if (saveState !== "{}") {
		op = 1;
	}

	window.textShown = false;
	window.requestAnimFrame = (function() {
		return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback) {
			window.setTimeout(callback, 1000 / framerate);
		};
	})();
	$('#clickToExit').bind('click', toggleDevTools);
	window.settings;
	if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        $('.rrssb-email').remove();
		settings = {
			os: "other",
			platform: "mobile",
			startDist: 227,
			creationDt: 60,
			baseScale: 1.4,
			scale: 1,
			prevScale: 1,
			baseHexWidth: 87,
			hexWidth: 87,
			baseBlockHeight: 20,
			blockHeight: 20,
			rows: 7,
			speedModifier: 0.73,
			speedUpKeyHeld: false,
			creationSpeedModifier: 0.73,
			comboTime: 310
		};
	} else {
		settings = {
			os: "other",
			platform: "nonmobile",
			baseScale: 1,
			startDist: 340,
			creationDt: 9,
			scale: 1,
			prevScale: 1,
			hexWidth: 65,
			baseHexWidth: 87,
			baseBlockHeight: 20,
			blockHeight: 15,
			rows: 8,
			speedModifier: 0.65,
			speedUpKeyHeld: false,
			creationSpeedModifier: 0.65,
			comboTime: 310
		};

	}
	if(/Android/i.test(navigator.userAgent)) {
		settings.os = "android";
	}

	if(navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPod/i)){
		settings.os="ios";
	}

	window.canvas = document.getElementById('canvas');
	window.ctx = canvas.getContext('2d');
	window.trueCanvas = {
		width: canvas.width,
		height: canvas.height
	};
	scaleCanvas();

	window.framerate = 60;
	window.history = {};
	window.score = 0;
	window.scoreAdditionCoeff = 1;
	window.prevScore = 0;
	window.numHighScores = 3;

	highscores = [];
	if (localStorage.getItem('highscores')) {
		try {
			highscores = JSON.parse(localStorage.getItem('highscores'));
		} catch (e) {
			highscores = [];
		}
	}
	window.blocks = [];
	window.MainHex;
	window.gdx = 0;
	window.gdy = 0;
	window.devMode = 0;
	window.lastGen = undefined;
	window.prevTimeScored = undefined;
	window.nextGen = undefined;
	window.spawnLane = 0;
	window.importing = 0;
	window.importedHistory = undefined;
	window.startTime = undefined;
	window.gameState;
	window.gameTimer = gameTimerDuration; // Timer duration from Flutter or default 15 seconds
	window.gameTimerStartTime = undefined; // When the timer started
	window.gameTimerPausedElapsed = undefined; // Elapsed time when paused
	setStartScreen();
	if (a != 1) {
		window.canRestart = 1;
		// Pause on blur disabled - no pause button
		$('#startBtn').off();
		if (settings.platform == 'mobile') {
			$('#startBtn').on('touchstart', startBtnHandler);
		} else {
			$('#startBtn').on('mousedown', startBtnHandler);
		}

		document.addEventListener('touchmove', function(e) {
			e.preventDefault();
		}, false);
		$(window).resize(scaleCanvas);
		$(window).unload(function() {

			if (gameState == 1 || gameState == -1 || gameState === 0) localStorage.setItem("saveState", exportSaveState());
			else localStorage.setItem("saveState", "{}");
		});

		addKeyListeners();
		(function(i, s, o, g, r, a, m) {
			i['GoogleAnalyticsObject'] = r;
			i[r] = i[r] || function() {
				(i[r].q = i[r].q || []).push(arguments)
			}, i[r].l = 1 * new Date();
			a = s.createElement(o), m = s.getElementsByTagName(o)[0];
			a.async = 1;
			a.src = g;
			m.parentNode.insertBefore(a, m)
		})(window, document, 'script', '//www.google-analytics.com/analytics.js', 'ga');
		ga('create', 'UA-51272720-1', 'teamsnowman.github.io');
		ga('send', 'pageview');

		document.addEventListener("pause", handlePause, false);
		document.addEventListener("backbutton", handlePause, false);
		document.addEventListener("menubutton", handlePause, false); //menu button on android

		setTimeout(function() {
			if (settings.platform == "mobile") {
				try {
					document.body.removeEventListener('touchstart', handleTapBefore, false);
				} catch (e) {

				}

				try {
					document.body.removeEventListener('touchstart', handleTap, false);
				} catch (e) {

				}

				document.body.addEventListener('touchstart', handleTapBefore, false);
			} else {
				try {
					document.body.removeEventListener('mousedown', handleClickBefore, false);
				} catch (e) {

				}

				try {
					document.body.removeEventListener('mousedown', handleClick, false);
				} catch (e) {

				}

				document.body.addEventListener('mousedown', handleClickBefore, false);
			}
		}, 1);
	}
}

function startBtnHandler() {
	setTimeout(function() {
		if (settings.platform == "mobile") {
			try {
				document.body.removeEventListener('touchstart', handleTapBefore, false);
			} catch (e) {

			}

			try {
				document.body.removeEventListener('touchstart', handleTap, false);
			} catch (e) {

			}

			document.body.addEventListener('touchstart', handleTap, false);
		} else {
			try {
				document.body.removeEventListener('mousedown', handleClickBefore, false);
			} catch (e) {

			}

			try {
				document.body.removeEventListener('mousedown', handleClick, false);
			} catch (e) {

			}

			document.body.addEventListener('mousedown', handleClick, false);
		}
	}, 5);

	if (!canRestart) return false;

	if ($('#openSideBar').is(':visible')) {
		$('#openSideBar').fadeOut(150, "linear");
	}

	if (importing == 1) {
		init(1);
		checkVisualElements(0);
	} else {
		resumeGame();
	}
}

function handlePause() {
	if (gameState == 1 || gameState == 2) {
		pause();
	}
}

function handleTap(e) {
	handleClickTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
}

function handleClick(e) {
	handleClickTap(e.clientX, e.clientY);
}

function handleTapBefore(e) {
	var x = e.changedTouches[0].clientX;
	var y = e.changedTouches[0].clientY;

	if (x < 120 && y < 83 && $('.helpText').is(':visible')) {
		showHelp();
		return;
	}
}

function handleClickBefore(e) {
	var x = e.clientX;
	var y = e.clientY;

	if (x < 120 && y < 83 && $('.helpText').is(':visible')) {
		showHelp();
		return;
	}
}
