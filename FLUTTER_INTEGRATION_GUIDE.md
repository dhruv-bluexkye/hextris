# Flutter Integration Guide for HTML5 Games

This guide explains how to integrate your HTML5 game with Flutter, including timer functionality, session management, score submission, and error handling.

## Table of Contents
1. [Initialization & Session Parameters](#1-initialization--session-parameters)
2. [Timer Implementation](#2-timer-implementation)
3. [Score Submission](#3-score-submission)
4. [Close/Back Button Handler](#4-closeback-button-handler)
5. [Error Handling](#5-error-handling)
6. [Complete Code Examples](#6-complete-code-examples)

---

## 1. Initialization & Session Parameters

### Step 1.1: Declare Global Variables

Add these global variables at the top of your initialization file (e.g., `initialization.js`):

```javascript
// Flutter integration variables
var poolId = null;
var sessionId = null;
var authToken = null;
var gameStartTime = null;
var gameTimerDuration = 15; // Default timer duration in seconds
var apiServerUrl = 'https://api.metaninza.net'; // Default API server URL
```

### Step 1.2: Create URL Parameter Helper Function

```javascript
// Get URL parameters for Flutter integration (fallback method)
function getUrlParameter(name) {
	name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
	var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
	var results = regex.exec(location.search);
	return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}
```

### Step 1.3: Initialize Flutter Parameters

Create a function that initializes session parameters from multiple sources (priority order):

```javascript
// Initialize Flutter parameters - priority: window.__GAME_SESSION__ > URL params > postMessage
function initFlutterParams() {
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
				// Allow API server to be passed via postMessage
				if (event.data.apiServerUrl || event.data.apiServer) {
					apiServerUrl = event.data.apiServerUrl || event.data.apiServer;
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
	
	// Log for debugging
	if (sessionId && authToken) {
		console.log('Flutter session initialized successfully', {
			poolId: poolId,
			sessionId: sessionId,
			timerDuration: gameTimerDuration,
			apiServerUrl: apiServerUrl
		});
	} else {
		console.log('Flutter session parameters not found - game will run without score submission');
	}
}
```

### Step 1.4: Call Initialization on Page Load

```javascript
$(document).ready(function() {
	initFlutterParams();

	// Re-check shortly after load in case Flutter injects params late
	setTimeout(function() {
		if (!sessionId || !authToken) {
			initFlutterParams();
		}
	}, 100);

	// Double-check once window is fully loaded
	$(window).on('load', function() {
		if (!sessionId || !authToken) {
			initFlutterParams();
		}
	});

	// Start the game after params are initialized
	initialize();
});
```

> Note: The API server URL still follows the same priority (injected session ➜ URL params ➜ default). When testing with `debug=true`, use `apiServerUrl` in the URL if you need a non-default server.

---

## 2. Timer Implementation

### Step 2.1: Declare Timer Variables

Add these variables where you manage game state:

```javascript
window.gameTimer = gameTimerDuration; // Current timer value
window.gameTimerStartTime = undefined; // When the timer started (timestamp)
window.gameTimerPausedElapsed = undefined; // Elapsed time when paused
```

### Step 2.2: Initialize Timer When Game Starts

In your game start function:

```javascript
function startGame() {
	// ... your existing game start code ...
	
	// Initialize timer
	gameTimer = gameTimerDuration; // Reset timer to configured duration
	gameTimerStartTime = Date.now(); // Track when timer started
	gameTimerPausedElapsed = undefined; // Reset pause tracking
}
```

### Step 2.3: Update Timer in Game Loop

In your main update/game loop function:

```javascript
function updateGame(deltaTime) {
	// ... your existing game update code ...
	
	// Update timer if game is running
	if (gameState == 1 && gameTimerStartTime !== undefined) {
		var elapsed = (Date.now() - gameTimerStartTime) / 1000; // Convert to seconds
		gameTimer = Math.max(0, gameTimerDuration - elapsed); // Timer duration minus elapsed time
		
		// Check if timer reached 0
		if (gameTimer <= 0) {
			// Trigger game over
			gameOver();
		}
	}
}
```

### Step 2.4: Handle Timer on Pause/Resume

```javascript
function pauseGame() {
	// ... your existing pause code ...
	
	// Store elapsed time when pausing
	if (gameTimerStartTime !== undefined) {
		var elapsed = (Date.now() - gameTimerStartTime) / 1000;
		window.gameTimerPausedElapsed = elapsed;
	}
}

function resumeGame() {
	// ... your existing resume code ...
	
	// Adjust timer start time when resuming to account for pause duration
	if (gameTimerPausedElapsed !== undefined && gameTimerStartTime !== undefined) {
		var pauseDuration = (Date.now() - (gameTimerStartTime + gameTimerPausedElapsed * 1000));
		gameTimerStartTime += pauseDuration; // Adjust start time to account for pause
		window.gameTimerPausedElapsed = undefined;
	}
}
```

### Step 2.5: Display Timer in UI (Optional)

```javascript
function renderUI() {
	// ... your existing render code ...
	
	// Update timer display
	if (gameTimer !== undefined) {
		if (gameState == 1 && gameTimerStartTime !== undefined) {
			var timerValue = Math.ceil(gameTimer);
			$("#timerDisplay").text(timerValue);
			
			// Optional: Change color when timer is low
			if (gameTimer <= 5) {
				$("#timerDisplay").css('color', 'red');
			} else {
				$("#timerDisplay").css('color', 'white');
			}
		} else {
			$("#timerDisplay").text(gameTimerDuration);
		}
	}
}
```

---

## 3. Score Submission

### Step 3.1: Create Message Sender Function

Add this helper function to send messages to Flutter:

```javascript
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
```

### Step 3.2: Create Score Submission Function

```javascript
// Submit score to Flutter backend
function submitScoreToFlutter() {
	// Check if required parameters are available
	if (!poolId || !sessionId || !authToken) {
		console.log('Flutter parameters not available. Score not submitted.');
		return;
	}
	
	// Calculate time taken in seconds
	// If timer reached 0, time is full timer duration
	// Otherwise, if game ended early, time is timerDuration - remaining timer
	var timeTaken = gameTimerDuration; // Default to full timer duration
	
	if (gameTimer !== undefined && gameTimer > 0) {
		// Game ended early (before timer), calculate time taken
		timeTaken = gameTimerDuration - gameTimer;
		timeTaken = Math.ceil(timeTaken);
	} else if (gameTimer !== undefined && gameTimer <= 0) {
		// Timer reached 0, full timer duration
		timeTaken = gameTimerDuration;
	}
	
	// Ensure time is at least 1 second and at most timer duration
	timeTaken = Math.max(1, Math.min(gameTimerDuration, timeTaken));
	
	// Use injected API server URL or default
	var baseUrl = apiServerUrl || 'https://api.metaninza.net';
	// Remove trailing slash if present
	baseUrl = baseUrl.replace(/\/$/, '');
	var url = baseUrl + '/api/v1/game-pools/' + poolId + '/sessions/' + sessionId + '/submit-score';
	var data = {
		score: score, // Your game's score variable
		time: timeTaken
	};
	
	// Make API request
	fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Bearer ' + authToken
		},
		body: JSON.stringify(data)
	})
	.then(async response => {
		// Try to parse response as JSON (works for both success and error)
		var responseData;
		try {
			responseData = await response.json();
		} catch (e) {
			// If JSON parsing fails, create error object
			responseData = {
				error: 'Failed to parse response',
				message: response.statusText || 'Unknown error',
				status: response.status
			};
		}
		
		if (!response.ok) {
			// Non-200 status code - send error JSON to Flutter
			console.error('Error submitting score:', responseData);
			sendMessageToFlutter('scoreSubmitError', {
				status: response.status,
				error: responseData
			});
			return;
		}
		
		// Success - send success response to Flutter
		console.log('Score submitted successfully:', responseData);
		sendMessageToFlutter('scoreSubmitSuccess', {
			status: response.status,
			data: responseData
		});
	})
	.catch(error => {
		// Network error or other fetch error
		console.error('Error submitting score:', error);
		var errorData = {
			error: 'Network error',
			message: error.message || 'Failed to submit score',
			status: 0
		};
		sendMessageToFlutter('scoreSubmitError', {
			status: 0,
			error: errorData
		});
	});
}
```

### Step 3.3: Call Score Submission on Game Over

In your game over function:

```javascript
function gameOver() {
	// ... your existing game over code ...
	
	// Submit score to Flutter backend
	submitScoreToFlutter();
}
```

---

## 4. Close/Back Button Handler

### Step 4.1: Create Close Window Function

```javascript
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
```

### Step 4.2: Add Back Button Event Listener

In your input/event handler setup:

```javascript
function setupEventListeners() {
	// ... your existing event listeners ...
	
	// Back button handler
	$("#backButton").on('click touchstart', function() {
		closeFlutterWindow();
		return false;
	});
	
	// Optional: Handle browser back button
	window.addEventListener('popstate', function(event) {
		closeFlutterWindow();
	});
}
```

### Step 4.3: Add Back Button to HTML

```html
<button id='backButton'>Back</button>
```

### Step 4.4: Style Back Button (CSS)

```css
#backButton {
	position: absolute;
	left: 50%;
	bottom: 20px;
	transform: translate(-50%, 0%);
	-webkit-transform: translate(-50%, 0%);
	-moz-transform: translate(-50%, 0%);
	-ms-transform: translate(-50%, 0%);
	padding: 15px 30px;
	font-size: 18px;
	background-color: #232323;
	color: white;
	border: none;
	border-radius: 5px;
	cursor: pointer;
	font-family: Exo, sans-serif;
	font-weight: bold;
	z-index: 100;
	display: none; /* Show when game over */
}
```

---

## 5. Error Handling

### Step 5.1: Error Handling in Score Submission

The score submission function already includes comprehensive error handling:

- **Network Errors**: Caught in `.catch()` block
- **HTTP Errors (non-200)**: Parsed and sent to Flutter with full error JSON
- **JSON Parse Errors**: Handled gracefully with fallback error object

### Step 5.2: Flutter Message Types

Your game will send these message types to Flutter:

**Success Message:**
```javascript
{
	type: 'scoreSubmitSuccess',
	data: {
		status: 200,
		data: { /* API response data */ }
	}
}
```

**Error Message:**
```javascript
{
	type: 'scoreSubmitError',
	data: {
		status: 400, // or 500, etc.
		error: { /* Full error JSON from API */ }
	}
}
```

**Close Game Message:**
```javascript
{
	type: 'closeGame'
}
```

### Step 5.3: Flutter Side Implementation

On the Flutter side, listen for these messages:

```dart
// For iframe
window.addEventListener('message', (event) => {
  if (event.data.type === 'scoreSubmitSuccess') {
    // Handle success
  } else if (event.data.type === 'scoreSubmitError') {
    // Handle error - event.data.data.error contains the error JSON
  } else if (event.data.type === 'closeGame') {
    // Close the game window
  }
});

// For InAppWebView
onMessage: (controller, message) {
  if (message.name == 'onMessage') {
    var data = message.body;
    if (data['type'] == 'scoreSubmitSuccess') {
      // Handle success
    } else if (data['type'] == 'scoreSubmitError') {
      // Handle error - data['data']['error'] contains the error JSON
    } else if (data['type'] == 'closeGame') {
      // Close the game window
    }
  }
}
```

---

## 6. Complete Code Examples

### Complete Initialization File Example

```javascript
// initialization.js

// Flutter integration variables
var poolId = null;
var sessionId = null;
var authToken = null;
var gameStartTime = null;
var gameTimerDuration = 15;

// Get URL parameters
function getUrlParameter(name) {
	name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
	var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
	var results = regex.exec(location.search);
	return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Initialize Flutter parameters
function initFlutterParams() {
	if (window.__GAME_SESSION__) {
		sessionId = window.__GAME_SESSION__.sessionId;
		authToken = window.__GAME_SESSION__.token;
		if (window.__GAME_SESSION__.poolId) {
			poolId = window.__GAME_SESSION__.poolId;
		} else {
			poolId = getUrlParameter('poolId');
		}
		if (window.__GAME_SESSION__.timerDuration !== undefined) {
			gameTimerDuration = parseInt(window.__GAME_SESSION__.timerDuration) || 15;
		}
		if (window.__GAME_SESSION__.apiServerUrl) {
			apiServerUrl = window.__GAME_SESSION__.apiServerUrl;
		} else if (window.__GAME_SESSION__.apiServer) {
			apiServerUrl = window.__GAME_SESSION__.apiServer;
		}
	} else {
		poolId = getUrlParameter('poolId');
		sessionId = getUrlParameter('sessionId');
		authToken = getUrlParameter('authToken');
		var urlTimer = getUrlParameter('timer');
		if (urlTimer) {
			gameTimerDuration = parseInt(urlTimer) || 15;
		}
		var urlApiServer = getUrlParameter('apiServerUrl') || getUrlParameter('apiServer');
		if (urlApiServer) {
			apiServerUrl = urlApiServer;
		}
	}
	
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
			}
		});
	}
}

// Close Flutter window
function closeFlutterWindow() {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'closeGame' }, '*');
	} else if (window.flutter_inappwebview) {
		window.flutter_inappwebview.callHandler('closeGame');
	} else {
		window.close();
	}
}

// Send message to Flutter
function sendMessageToFlutter(type, data) {
	var message = { type: type, data: data };
	if (window.parent && window.parent !== window) {
		window.parent.postMessage(message, '*');
	} else if (window.flutter_inappwebview) {
		window.flutter_inappwebview.callHandler('onMessage', message);
	} else {
		console.log('Flutter message:', message);
	}
}

$(document).ready(function() {
	initFlutterParams();
	document.addEventListener('visibilitychange', function() {
		if (!document.hidden) {
			initFlutterParams();
		}
	});
	window.addEventListener('focus', function() {
		initFlutterParams();
	});
});
```

---

## Testing

### Test with URL Parameters

Add these to your game URL for testing:
```
?debug=true&poolId=test-pool&sessionId=test-session&authToken=test-token&timer=30&apiServerUrl=https://api.metaninza.net
```

### Test with Flutter InAppWebView

Flutter should inject:
```javascript
window.__GAME_SESSION__ = {
	sessionId: 'your-session-id',
	token: 'your-auth-token',
	poolId: 'your-pool-id',
	timerDuration: 30,
	apiServerUrl: 'https://api.metaninza.net' // Optional: API server URL
};
```

---

## Checklist

- [ ] Global variables declared (poolId, sessionId, authToken, gameTimerDuration, apiServerUrl)
- [ ] `initFlutterParams()` function implemented
- [ ] Initialization called on page load
- [ ] Timer variables declared and initialized
- [ ] Timer updated in game loop
- [ ] Timer pause/resume handling implemented
- [ ] `submitScoreToFlutter()` function implemented
- [ ] Score submission called on game over
- [ ] `closeFlutterWindow()` function implemented
- [ ] Back button event listener added
- [ ] Error handling in score submission
- [ ] `sendMessageToFlutter()` function implemented
- [ ] Back button styled and positioned

---

## Notes

- Always check if `poolId`, `sessionId`, and `authToken` are available before submitting scores
- API server URL can be injected from Flutter via `window.__GAME_SESSION__.apiServerUrl` or `window.__GAME_SESSION__.apiServer`
- If no API server URL is provided, defaults to `https://api.metaninza.net`
- Timer should be initialized when game starts and updated in the game loop
- Error responses from API are sent to Flutter with full error JSON
- Back button should call `closeFlutterWindow()` to properly communicate with Flutter
- All Flutter communication uses postMessage (iframe) or callHandler (InAppWebView)

---

## Support

For issues or questions, refer to the main game implementation in:
- `js/initialization.js` - Session and Flutter communication
- `js/view.js` - Score submission
- `js/input.js` - Back button handler
- `js/main.js` - Timer initialization
- `js/update.js` - Timer updates


