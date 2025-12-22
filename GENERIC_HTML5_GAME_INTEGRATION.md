# Generic HTML5 Game Flutter Integration Guide

This guide provides step-by-step instructions to integrate **any HTML5 game** with Flutter, including session management, timer functionality, score submission, and UI state management.

---

## Table of Contents

1. [Understanding Your Game Structure](#1-understanding-your-game-structure)
2. [Step 1: Add Global Variables](#2-step-1-add-global-variables)
3. [Step 2: Session Parameter Initialization](#3-step-2-session-parameter-initialization)
4. [Step 3: Control Play Button Visibility](#4-step-3-control-play-button-visibility)
5. [Step 4: Add Loading Message](#5-step-4-add-loading-message)
6. [Step 5: Timer Implementation (Optional)](#6-step-5-timer-implementation-optional)
7. [Step 6: Score Submission](#7-step-6-score-submission)
8. [Step 7: Game Over UI State](#8-step-7-game-over-ui-state)
9. [Step 8: Back Button Handler](#9-step-8-back-button-handler)
10. [Step 9: Flutter Communication](#10-step-9-flutter-communication)
11. [Testing Checklist](#11-testing-checklist)

---

## 1. Understanding Your Game Structure

Before starting, identify these key components in your game:

### Find These Files/Functions:

1. **Initialization File** - Usually named:
   - `main.js`, `game.js`, `init.js`, `initialization.js`
   - Look for `window.onload`, `$(document).ready()`, or `DOMContentLoaded`

2. **Game Start Function** - Usually named:
   - `startGame()`, `initGame()`, `beginGame()`, `play()`
   - Called when user clicks play/start button

3. **Game Over Function** - Usually named:
   - `gameOver()`, `endGame()`, `gameEnd()`, `onGameOver()`
   - Called when game ends

4. **Score Variable** - Usually named:
   - `score`, `points`, `gameScore`, `playerScore`
   - Global variable that tracks current score

5. **Game State Variable** - Usually named:
   - `gameState`, `state`, `currentState`, `status`
   - Tracks if game is: menu (0), playing (1), paused (-1), game over (2)

6. **Render/Draw Function** - Usually named:
   - `render()`, `draw()`, `update()`, `renderFrame()`
   - Called in game loop to draw UI

7. **Play Button Element** - Usually:
   - HTML: `<button id="play">`, `<div id="start">`, `<button id="startBtn">`
   - Or rendered in canvas

8. **Back Button Element** - Usually:
   - HTML: `<button id="back">`, `<button id="backButton">`
   - Or needs to be added

### Quick Search Commands:

```bash
# Find initialization
grep -r "document.ready\|window.onload\|DOMContentLoaded" .

# Find game start
grep -r "function.*start\|function.*play\|function.*begin" .

# Find game over
grep -r "function.*gameOver\|function.*endGame\|game.*over" .

# Find score variable
grep -r "var score\|let score\|const score" .
```

---

## 2. Step 1: Add Global Variables

### Location: Top of your main initialization file

Add these variables at the very top of your main JavaScript file (before any other code):

```javascript
// ============================================
// Flutter Integration Variables
// ============================================
var poolId = null;
var sessionId = null;
var authToken = null;
var gameStartTime = null;
var gameTimerDuration = 15; // Default timer duration in seconds
var apiServerUrl = 'https://api.metaninza.net'; // Default API server URL

// Session and submission state tracking
var sessionReady = false; // Track if session parameters are ready
var scoreSubmitting = false; // Track if score is being submitted
var scoreSubmissionComplete = false; // Track if score submission is complete

// Timer variables (if using timer)
var gameTimer = null; // Current timer value
var gameTimerStartTime = undefined; // When the timer started (timestamp)
var gameTimerPausedElapsed = undefined; // Elapsed time when paused
```

**Note:** If your game uses ES6 modules, declare these in a global scope or attach to `window`:
```javascript
window.poolId = null;
window.sessionId = null;
// ... etc
```

---

## 3. Step 2: Session Parameter Initialization

### Location: In your initialization file, before game starts

### Step 2.1: Add URL Parameter Helper

```javascript
// Get URL parameters for Flutter integration (fallback method)
function getUrlParameter(name) {
	name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
	var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
	var results = regex.exec(location.search);
	return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}
```

### Step 2.2: Add Session Initialization Function

```javascript
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
					// Show play button if on start screen (adjust gameState value for your game)
					if (gameState === 0 || gameState === 'menu' || gameState === 'start') {
						showPlayButton(); // Call your function to show play button
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
```

### Step 2.3: Add Session Check Function

```javascript
// Function to check session and update UI
function checkSessionAndUpdateUI() {
	var wasReady = sessionReady;
	initFlutterParams();
	
	// If session just became ready, show the play button
	if (sessionReady && !wasReady) {
		// Adjust these conditions based on your game's state system
		if (gameState === 0 || gameState === 'menu' || gameState === 'start') {
			showPlayButton(); // Your function to show play button
		}
	}
	
	// If session is not ready, keep checking periodically
	if (!sessionReady) {
		setTimeout(checkSessionAndUpdateUI, 500);
	}
}
```

### Step 2.4: Call Initialization on Page Load

Find your page load handler (usually `$(document).ready()`, `window.onload`, or `DOMContentLoaded`) and add:

```javascript
// Your existing page load code...
$(document).ready(function() {
	// ... existing initialization ...
	
	// Initialize Flutter params
	initFlutterParams();
	
	// Check for session after a short delay
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
	
	// Re-check on visibility change
	document.addEventListener('visibilitychange', function() {
		if (!document.hidden) {
			checkSessionAndUpdateUI();
		}
	});
	
	// Also listen for focus events
	window.addEventListener('focus', function() {
		checkSessionAndUpdateUI();
	});
	
	// ... rest of your initialization ...
});
```

---

## 4. Step 3: Control Play Button Visibility

### Location: Wherever you show/hide the play button

### Option A: If play button is an HTML element

Find where you show the play button and add session check:

```javascript
function showPlayButton() {
	// Only show if session is ready
	if (sessionReady) {
		$('#playButton').show(); // or $('#startBtn').fadeIn();
		// or document.getElementById('playButton').style.display = 'block';
	} else {
		$('#playButton').hide();
	}
}

function hidePlayButton() {
	$('#playButton').hide();
}
```

### Option B: If play button is rendered in canvas

Find your render/draw function and add:

```javascript
function render() {
	// ... existing render code ...
	
	// Only render play button if session is ready
	if (gameState === 0 && sessionReady) {
		drawPlayButton(); // Your function to draw play button
	}
	
	// ... rest of render code ...
}
```

### Option C: If play button click handler exists

Find your play button click handler and add check:

```javascript
$('#playButton').on('click', function() {
	if (!sessionReady) {
		return false; // Don't start game if session not ready
	}
	startGame(); // Your existing start game function
});
```

---

## 5. Step 4: Add Loading Message

### Location: Where you display "Play" or start screen text

### Option A: Canvas-based games

Find where you draw the start screen text and modify:

```javascript
function drawStartScreen() {
	// ... existing code ...
	
	// Show "Setting up your session..." if session not ready
	if (!sessionReady) {
		ctx.fillText('Setting up your session...', x, y);
	} else {
		ctx.fillText('Play!', x, y); // Your existing play text
	}
	
	// ... rest of code ...
}
```

### Option B: HTML-based games

Find your start screen HTML or where you set the text:

```javascript
function updateStartScreen() {
	var playTextElement = document.getElementById('playText');
	if (!sessionReady) {
		playTextElement.textContent = 'Setting up your session...';
		playTextElement.style.display = 'block';
	} else {
		playTextElement.textContent = 'Play!';
		playTextElement.style.display = 'block';
	}
}
```

Call `updateStartScreen()` in your render loop or after session check.

---

## 6. Step 5: Timer Implementation (Optional)

Only needed if your game uses a timer.

### Step 5.1: Initialize Timer When Game Starts

Find your `startGame()` function:

```javascript
function startGame() {
	// ... existing start game code ...
	
	// Initialize timer
	gameTimer = gameTimerDuration; // Reset timer to configured duration
	gameTimerStartTime = Date.now(); // Track when timer started
	gameTimerPausedElapsed = undefined; // Reset pause tracking
	
	// ... rest of start game code ...
}
```

### Step 5.2: Update Timer in Game Loop

Find your main game loop/update function:

```javascript
function update(deltaTime) {
	// ... existing update code ...
	
	// Update timer if game is running
	if (gameState === 1 && gameTimerStartTime !== undefined) {
		var elapsed = (Date.now() - gameTimerStartTime) / 1000; // Convert to seconds
		gameTimer = Math.max(0, gameTimerDuration - elapsed);
		
		// Check if timer reached 0
		if (gameTimer <= 0) {
			gameOver(); // Trigger game over
		}
	}
	
	// ... rest of update code ...
}
```

### Step 5.3: Handle Timer on Pause/Resume

Find your pause/resume functions:

```javascript
function pauseGame() {
	// ... existing pause code ...
	
	// Store elapsed time when pausing
	if (gameTimerStartTime !== undefined) {
		var elapsed = (Date.now() - gameTimerStartTime) / 1000;
		gameTimerPausedElapsed = elapsed;
	}
}

function resumeGame() {
	// ... existing resume code ...
	
	// Adjust timer start time when resuming
	if (gameTimerPausedElapsed !== undefined && gameTimerStartTime !== undefined) {
		var pauseDuration = (Date.now() - (gameTimerStartTime + gameTimerPausedElapsed * 1000));
		gameTimerStartTime += pauseDuration;
		gameTimerPausedElapsed = undefined;
	}
}
```

---

## 7. Step 6: Score Submission

### Location: Create a new function, call it from game over

### Step 6.1: Add Flutter Message Sender

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

### Step 6.2: Add Score Submission Function

```javascript
// Submit score to Flutter backend
function submitScoreToFlutter() {
	// Check if required parameters are available
	if (!poolId || !sessionId || !authToken) {
		console.log('Flutter parameters not available. Score not submitted.');
		// Show back button if no session
		showBackButton();
		updateGameOverMessage('GAME OVER');
		return;
	}
	
	// Mark that we're submitting
	scoreSubmitting = true;
	scoreSubmissionComplete = false;
	
	// Calculate time taken in seconds
	var timeTaken = gameTimerDuration; // Default to full timer duration
	
	if (gameTimer !== undefined && gameTimer > 0) {
		// Game ended early, calculate time taken
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
	baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
	var url = baseUrl + '/api/v1/game-pools/' + poolId + '/sessions/' + sessionId + '/submit-score';
	var data = {
		score: score, // Your game's score variable name
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
		var responseData;
		try {
			responseData = await response.json();
		} catch (e) {
			responseData = {
				error: 'Failed to parse response',
				message: response.statusText || 'Unknown error',
				status: response.status
			};
		}
		
		if (!response.ok) {
			// Error - send to Flutter
			console.error('Error submitting score:', responseData);
			sendMessageToFlutter('scoreSubmitError', {
				status: response.status,
				error: responseData
			});
			// Mark submission complete and show back button
			scoreSubmitting = false;
			scoreSubmissionComplete = true;
			updateGameOverMessage('GAME OVER');
			showBackButton();
			return;
		}
		
		// Success - send to Flutter
		console.log('Score submitted successfully:', responseData);
		sendMessageToFlutter('scoreSubmitSuccess', {
			status: response.status,
			data: responseData
		});
		
		// Mark submission complete and show back button
		scoreSubmitting = false;
		scoreSubmissionComplete = true;
		updateGameOverMessage('GAME OVER');
		showBackButton();
	})
	.catch(error => {
		// Network error
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
		
		// Mark submission complete and show back button
		scoreSubmitting = false;
		scoreSubmissionComplete = true;
		updateGameOverMessage('GAME OVER');
		showBackButton();
	});
}
```

**Important:** Replace `score` with your actual score variable name (could be `points`, `gameScore`, etc.)

### Step 6.3: Call from Game Over

Find your `gameOver()` function:

```javascript
function gameOver() {
	// ... existing game over code ...
	
	// Submit score to Flutter backend
	submitScoreToFlutter();
	
	// ... rest of game over code ...
}
```

---

## 8. Step 7: Game Over UI State

### Location: Your game over function

Modify your game over function to handle UI states:

```javascript
function gameOver() {
	// ... existing game over code ...
	
	// Reset score submission state
	scoreSubmitting = false;
	scoreSubmissionComplete = false;
	
	// Hide back button initially
	hideBackButton();
	
	// Update game over message
	if (poolId && sessionId && authToken) {
		updateGameOverMessage('Submitting score...');
	} else {
		updateGameOverMessage('GAME OVER');
		// If no session, show back button immediately
		showBackButton();
	}
	
	// Submit score to Flutter backend
	submitScoreToFlutter();
	
	// ... rest of game over code ...
}

// Helper functions (implement based on your UI system)
function updateGameOverMessage(text) {
	// Option A: HTML element
	$('#gameOverText').text(text);
	// or document.getElementById('gameOverText').textContent = text;
	
	// Option B: Canvas
	// Draw text in your render function based on a variable
	gameOverMessage = text;
}

function showBackButton() {
	$('#backButton').fadeIn();
	// or document.getElementById('backButton').style.display = 'block';
}

function hideBackButton() {
	$('#backButton').hide();
	// or document.getElementById('backButton').style.display = 'none';
}
```

---

## 9. Step 8: Back Button Handler

### Step 8.1: Add Close Window Function

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

### Step 8.2: Add Back Button HTML (if needed)

Add to your HTML file:

```html
<button id="backButton" style="display: none;">Back</button>
```

### Step 8.3: Add Event Listener

Find where you set up event listeners:

```javascript
function setupEventListeners() {
	// ... existing event listeners ...
	
	// Back button handler
	$('#backButton').on('click touchstart', function() {
		closeFlutterWindow();
		return false;
	});
	
	// Optional: Handle browser back button
	window.addEventListener('popstate', function(event) {
		closeFlutterWindow();
	});
}
```

---

## 10. Step 9: Flutter Communication

All Flutter communication is handled automatically through:
- `sendMessageToFlutter()` - Sends messages to Flutter
- `closeFlutterWindow()` - Closes game window
- `initFlutterParams()` - Receives parameters from Flutter

No additional code needed here.

---

## 11. Testing Checklist

### Before Testing:

- [ ] All global variables added
- [ ] `initFlutterParams()` function added
- [ ] `checkSessionAndUpdateUI()` function added
- [ ] Initialization called on page load
- [ ] Play button visibility controlled by `sessionReady`
- [ ] Loading message shows when session not ready
- [ ] `submitScoreToFlutter()` function added
- [ ] Score submission called from game over
- [ ] `closeFlutterWindow()` function added
- [ ] Back button handler added
- [ ] Game over UI updates correctly

### Test Scenarios:

1. **Session Injection Test:**
   - [ ] Game shows "Setting up your session..." initially
   - [ ] Play button is hidden until session injected
   - [ ] Play button appears after session injected
   - [ ] "Play!" text appears after session ready

2. **Gameplay Test:**
   - [ ] Game starts normally when session ready
   - [ ] Timer works (if implemented)
   - [ ] Score tracks correctly

3. **Game Over Test:**
   - [ ] "Submitting score..." shows when game ends
   - [ ] Back button is hidden during submission
   - [ ] "GAME OVER" shows after submission
   - [ ] Back button appears after submission
   - [ ] Back button works and closes game

4. **Error Handling Test:**
   - [ ] If no session, game over shows immediately
   - [ ] If API fails, error is handled gracefully
   - [ ] Back button appears even on error

### Test with URL Parameters:

Add to your game URL for testing:
```
?debug=true&poolId=test-pool&sessionId=test-session&authToken=test-token&timer=30
```

---

## Common Game-Specific Adaptations

### If your game uses classes/modules:

```javascript
// Attach to window for global access
window.FlutterIntegration = {
	poolId: null,
	sessionId: null,
	authToken: null,
	sessionReady: false,
	// ... etc
	initFlutterParams: function() { /* ... */ }
};
```

### If your game uses TypeScript:

```typescript
declare global {
	interface Window {
		__GAME_SESSION__?: {
			sessionId?: string;
			token?: string;
			poolId?: string;
			timerDuration?: number;
			apiServerUrl?: string;
			expiresAt?: number;
		};
		flutter_inappwebview?: {
			callHandler: (name: string, ...args: any[]) => void;
		};
	}
}
```

### If your game uses a framework (React, Vue, etc.):

- Add variables to component state or global store
- Use framework lifecycle hooks instead of `$(document).ready()`
- Update UI through framework's reactive system

---

## Troubleshooting

### Play button never appears:
- Check console for session initialization logs
- Verify `sessionReady` is being set to `true`
- Check if Flutter is injecting `window.__GAME_SESSION__`

### "Setting up your session..." never changes:
- Check browser console for errors
- Verify `initFlutterParams()` is being called
- Check if Flutter is sending parameters

### Score not submitting:
- Check network tab for API requests
- Verify `poolId`, `sessionId`, `authToken` are set
- Check console for error messages

### Back button not working:
- Verify `closeFlutterWindow()` is called
- Check if Flutter is listening for messages
- Check browser console for errors

---

## Quick Reference: Variable Names to Find/Replace

When adapting this guide, search and replace these in your game:

| This Guide | Your Game Might Use |
|------------|---------------------|
| `score` | `points`, `gameScore`, `playerScore` |
| `gameState` | `state`, `currentState`, `status` |
| `startGame()` | `initGame()`, `beginGame()`, `play()` |
| `gameOver()` | `endGame()`, `gameEnd()`, `onGameOver()` |
| `render()` | `draw()`, `update()`, `renderFrame()` |
| `#playButton` | `#start`, `#startBtn`, `#play` |
| `#backButton` | `#back`, `#exit`, `#close` |

---

## Support

For Flutter-side implementation, see `FLUTTER_SIDE_IMPLEMENTATION.md`.

For game-specific questions, check:
- Browser console for JavaScript errors
- Network tab for API requests
- Flutter console for message logs

