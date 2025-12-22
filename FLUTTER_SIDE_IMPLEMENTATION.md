# Flutter Side Implementation Guide

This guide explains what needs to be implemented on the Flutter side to work with the updated HTML5 game.

## Overview

The game now:
- **Waits for session parameters** before showing the play button
- **Shows "Setting up your session..."** while waiting
- **Shows "Submitting score..."** after game ends
- **Hides back button** until score submission completes
- **Requests session parameters** if not injected immediately

---

## 1. Session Parameter Injection

### Method 1: Inject via `window.__GAME_SESSION__` (Recommended for InAppWebView)

Inject session parameters **immediately** when the WebView loads, before the page finishes loading.

#### For InAppWebView:

```dart
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri('https://your-game-url.com')),
  initialSettings: InAppWebViewSettings(
    // ... your settings
  ),
  onLoadStart: (controller, url) async {
    // Inject session parameters immediately
    await controller.evaluateJavascript(source: '''
      window.__GAME_SESSION__ = {
        sessionId: '${sessionId}',
        token: '${authToken}',
        poolId: '${poolId}',
        timerDuration: ${timerDuration}, // in seconds
        apiServerUrl: '${apiServerUrl}', // optional, defaults to https://api.metaninza.net
        expiresAt: ${expiresAtTimestamp} // optional, milliseconds since epoch
      };
    ''');
  },
)
```

#### Required Session Object Properties:

```javascript
window.__GAME_SESSION__ = {
  sessionId: string,      // REQUIRED: Session ID
  token: string,          // REQUIRED: Auth token (Bearer token)
  poolId: string,         // REQUIRED: Game pool ID
  timerDuration: number,  // REQUIRED: Timer duration in seconds (e.g., 30)
  apiServerUrl: string,   // OPTIONAL: API server URL (defaults to https://api.metaninza.net)
  apiServer: string,      // OPTIONAL: Alternative name for apiServerUrl
  expiresAt: number       // OPTIONAL: Expiration timestamp in milliseconds
}
```

### Method 2: Send via postMessage (For iframe or delayed injection)

If using iframe or if you need to inject parameters after page load:

```dart
// Send session parameters via postMessage
webViewController.evaluateJavascript('''
  window.postMessage({
    type: 'flutterParams',
    sessionId: '${sessionId}',
    authToken: '${authToken}',
    poolId: '${poolId}',
    timerDuration: ${timerDuration},
    apiServerUrl: '${apiServerUrl}'
  }, '*');
''');
```

---

## 2. Handle Session Parameter Requests

The game will request session parameters if they're not available. You need to listen for these requests.

### For InAppWebView:

```dart
InAppWebView(
  // ... other settings
  onConsoleMessage: (controller, consoleMessage) {
    // Listen for parameter requests
    if (consoleMessage.message == 'Requesting Flutter for session parameters...') {
      // Inject session parameters
      controller.evaluateJavascript(source: '''
        window.__GAME_SESSION__ = {
          sessionId: '${sessionId}',
          token: '${authToken}',
          poolId: '${poolId}',
          timerDuration: ${timerDuration},
          apiServerUrl: '${apiServerUrl}'
        };
      ''');
    }
  },
  // Add JavaScript handler for requestSessionParams
  onLoadStop: (controller, url) async {
    await controller.addJavaScriptHandler(
      handlerName: 'requestSessionParams',
      callback: (args) {
        // Inject session parameters when requested
        controller.evaluateJavascript(source: '''
          window.__GAME_SESSION__ = {
            sessionId: '${sessionId}',
            token: '${authToken}',
            poolId: '${poolId}',
            timerDuration: ${timerDuration},
            apiServerUrl: '${apiServerUrl}'
          };
        ''');
      },
    );
  },
)
```

### For iframe (WebView):

```dart
// Listen for postMessage requests
webViewController.addJavaScriptChannel(
  'requestSessionParams',
  onMessageReceived: (JavaScriptMessage message) {
    // Send session parameters back via postMessage
    webViewController.evaluateJavascript('''
      window.postMessage({
        type: 'flutterParams',
        sessionId: '${sessionId}',
        authToken: '${authToken}',
        poolId: '${poolId}',
        timerDuration: ${timerDuration},
        apiServerUrl: '${apiServerUrl}'
      }, '*');
    ''');
  },
);
```

---

## 3. Listen for Game Messages

The game sends messages to Flutter for various events. You need to handle these:

### Message Types:

1. **`requestSessionParams`** - Game is requesting session parameters
2. **`scoreSubmitSuccess`** - Score submitted successfully
3. **`scoreSubmitError`** - Score submission failed
4. **`closeGame`** - User clicked back button

### For InAppWebView:

```dart
InAppWebView(
  // ... other settings
  onLoadStop: (controller, url) async {
    // Add handler for game messages
    await controller.addJavaScriptHandler(
      handlerName: 'onMessage',
      callback: (args) {
        if (args.isNotEmpty) {
          final message = args[0] as Map<String, dynamic>;
          final type = message['type'] as String?;
          final data = message['data'] as Map<String, dynamic>?;
          
          switch (type) {
            case 'scoreSubmitSuccess':
              // Handle successful score submission
              print('Score submitted successfully: ${data}');
              // Update UI, navigate, etc.
              break;
              
            case 'scoreSubmitError':
              // Handle score submission error
              print('Score submission error: ${data}');
              final error = data?['error'];
              final status = data?['status'];
              // Show error message, retry, etc.
              break;
              
            case 'closeGame':
              // User wants to close/exit game
              Navigator.pop(context); // or your navigation logic
              break;
          }
        }
      },
    );
    
    // Add handler for closeGame
    await controller.addJavaScriptHandler(
      handlerName: 'closeGame',
      callback: (args) {
        Navigator.pop(context); // or your navigation logic
      },
    );
  },
)
```

### For iframe (WebView):

```dart
// Listen for postMessage from iframe
webViewController.addJavaScriptChannel(
  'FlutterMessage',
  onMessageReceived: (JavaScriptMessage message) {
    final data = jsonDecode(message.message);
    final type = data['type'];
    final messageData = data['data'];
    
    switch (type) {
      case 'scoreSubmitSuccess':
        print('Score submitted: ${messageData}');
        break;
      case 'scoreSubmitError':
        print('Error: ${messageData}');
        break;
      case 'closeGame':
        Navigator.pop(context);
        break;
    }
  },
);

// In your HTML/JavaScript, you'll need to bridge postMessage to FlutterMessage
```

### Alternative: Listen to postMessage directly

If using iframe, you can inject a listener:

```dart
webViewController.evaluateJavascript('''
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type) {
      // Send to Flutter via JavaScript channel
      FlutterMessage.postMessage(JSON.stringify(event.data));
    }
  });
''');
```

---

## 4. Complete InAppWebView Example

```dart
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class GameWebView extends StatefulWidget {
  final String sessionId;
  final String authToken;
  final String poolId;
  final int timerDuration;
  final String apiServerUrl;
  
  const GameWebView({
    Key? key,
    required this.sessionId,
    required this.authToken,
    required this.poolId,
    required this.timerDuration,
    this.apiServerUrl = 'https://api.metaninza.net',
  }) : super(key: key);

  @override
  State<GameWebView> createState() => _GameWebViewState();
}

class _GameWebViewState extends State<GameWebView> {
  InAppWebViewController? webViewController;
  
  String get gameUrl => 'https://your-game-url.com';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: InAppWebView(
        initialUrlRequest: URLRequest(url: WebUri(gameUrl)),
        initialSettings: InAppWebViewSettings(
          javaScriptEnabled: true,
          domStorageEnabled: true,
        ),
        onWebViewCreated: (controller) {
          webViewController = controller;
        },
        onLoadStart: (controller, url) async {
          // Inject session parameters immediately
          await injectSessionParams(controller);
        },
        onLoadStop: (controller, url) async {
          // Re-inject in case page reloaded
          await injectSessionParams(controller);
          
          // Set up message handlers
          await setupMessageHandlers(controller);
        },
        onConsoleMessage: (controller, consoleMessage) {
          // Listen for parameter requests
          if (consoleMessage.message.contains('Requesting Flutter for session parameters')) {
            injectSessionParams(controller);
          }
        },
      ),
    );
  }
  
  Future<void> injectSessionParams(InAppWebViewController controller) async {
    await controller.evaluateJavascript(source: '''
      window.__GAME_SESSION__ = {
        sessionId: '${widget.sessionId}',
        token: '${widget.authToken}',
        poolId: '${widget.poolId}',
        timerDuration: ${widget.timerDuration},
        apiServerUrl: '${widget.apiServerUrl}'
      };
    ''');
  }
  
  Future<void> setupMessageHandlers(InAppWebViewController controller) async {
    // Handle game messages
    await controller.addJavaScriptHandler(
      handlerName: 'onMessage',
      callback: (args) {
        if (args.isNotEmpty) {
          final message = args[0] as Map<String, dynamic>;
          handleGameMessage(message);
        }
      },
    );
    
    // Handle close game request
    await controller.addJavaScriptHandler(
      handlerName: 'closeGame',
      callback: (args) {
        Navigator.pop(context);
      },
    );
    
    // Handle session parameter requests
    await controller.addJavaScriptHandler(
      handlerName: 'requestSessionParams',
      callback: (args) {
        injectSessionParams(controller);
      },
    );
  }
  
  void handleGameMessage(Map<String, dynamic> message) {
    final type = message['type'] as String?;
    final data = message['data'] as Map<String, dynamic>?;
    
    switch (type) {
      case 'scoreSubmitSuccess':
        print('Score submitted successfully!');
        print('Response: $data');
        // Handle success - update leaderboard, show success message, etc.
        break;
        
      case 'scoreSubmitError':
        print('Score submission failed!');
        print('Error: ${data?['error']}');
        print('Status: ${data?['status']}');
        // Handle error - show error message, retry, etc.
        break;
        
      case 'closeGame':
        Navigator.pop(context);
        break;
    }
  }
}
```

---

## 5. Complete iframe/WebView Example

```dart
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class GameWebView extends StatefulWidget {
  final String sessionId;
  final String authToken;
  final String poolId;
  final int timerDuration;
  final String apiServerUrl;
  
  const GameWebView({
    Key? key,
    required this.sessionId,
    required this.authToken,
    required this.poolId,
    required this.timerDuration,
    this.apiServerUrl = 'https://api.metaninza.net',
  }) : super(key: key);

  @override
  State<GameWebView> createState() => _GameWebViewState();
}

class _GameWebViewState extends State<GameWebView> {
  late final WebViewController webViewController;
  
  @override
  void initState() {
    super.initState();
    
    webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) {
            injectSessionParams();
            setupMessageListener();
          },
        ),
      )
      ..addJavaScriptChannel(
        'FlutterMessage',
        onMessageReceived: (JavaScriptMessage message) {
          handleGameMessage(message.message);
        },
      )
      ..loadRequest(Uri.parse('https://your-game-url.com'));
  }
  
  void injectSessionParams() {
    webViewController.runJavaScript('''
      window.__GAME_SESSION__ = {
        sessionId: '${widget.sessionId}',
        token: '${widget.authToken}',
        poolId: '${widget.poolId}',
        timerDuration: ${widget.timerDuration},
        apiServerUrl: '${widget.apiServerUrl}'
      };
    ''');
  }
  
  void setupMessageListener() {
    webViewController.runJavaScript('''
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type) {
          FlutterMessage.postMessage(JSON.stringify(event.data));
        }
      });
    ''');
  }
  
  void handleGameMessage(String messageJson) {
    final data = jsonDecode(messageJson);
    final type = data['type'];
    final messageData = data['data'];
    
    switch (type) {
      case 'scoreSubmitSuccess':
        print('Score submitted: $messageData');
        break;
      case 'scoreSubmitError':
        print('Error: $messageData');
        break;
      case 'closeGame':
        Navigator.pop(context);
        break;
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: WebViewWidget(controller: webViewController),
    );
  }
}
```

---

## 6. Important Notes

### Timing is Critical

- **Inject session parameters AS EARLY AS POSSIBLE** - ideally in `onLoadStart` or even before the page loads
- The game checks for parameters immediately and will show "Setting up your session..." if not found
- The game periodically checks for parameters, but immediate injection provides the best UX

### Session Object Structure

The game expects:
- `sessionId` (required)
- `token` (required) - this is the auth token, NOT `authToken`
- `poolId` (required)
- `timerDuration` (required) - in seconds
- `apiServerUrl` or `apiServer` (optional)

### Error Handling

- If session parameters are missing, the game will:
  - Show "Setting up your session..." message
  - Hide the play button
  - Periodically request parameters
  - Still allow gameplay but won't submit scores

- If score submission fails:
  - Game shows "GAME OVER" after error
  - Back button becomes visible
  - Error details are sent to Flutter via `scoreSubmitError` message

### Testing

You can test with URL parameters (for development):
```
https://your-game-url.com?debug=true&poolId=test-pool&sessionId=test-session&authToken=test-token&timer=30
```

---

## 7. Checklist

- [ ] Inject `window.__GAME_SESSION__` with all required parameters
- [ ] Inject parameters in `onLoadStart` (before page finishes loading)
- [ ] Handle `requestSessionParams` requests
- [ ] Listen for `scoreSubmitSuccess` messages
- [ ] Listen for `scoreSubmitError` messages
- [ ] Handle `closeGame` messages (navigate back)
- [ ] Test that play button appears after session injection
- [ ] Test that "Setting up your session..." shows when params missing
- [ ] Test that back button appears after score submission
- [ ] Test error handling when API fails

---

## 8. Message Format Reference

### Score Submit Success:
```json
{
  "type": "scoreSubmitSuccess",
  "data": {
    "status": 200,
    "data": {
      // API response data
    }
  }
}
```

### Score Submit Error:
```json
{
  "type": "scoreSubmitError",
  "data": {
    "status": 400,
    "error": {
      // Full error JSON from API
    }
  }
}
```

### Close Game:
```json
{
  "type": "closeGame"
}
```

### Request Session Params:
```json
{
  "type": "requestSessionParams"
}
```

---

## Support

For issues, check:
- Browser console for JavaScript errors
- Flutter console for message logs
- Network tab for API requests
- Ensure session parameters are injected before page load completes

