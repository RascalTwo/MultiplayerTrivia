# [Multiplayer Trivia](https://rascaltwo.github.io/MultiplayerTrivia/public)

Multiplayer Trivia game using the [OpenTDB API](https://opentdb.com/) and [Peer.js](https://peerjs.com/) library.

**Link to project:** https://rascaltwo.github.io/MultiplayerTrivia/public

https://user-images.githubusercontent.com/9403665/167023620-473c29ca-5a23-443d-bdd8-46cc72dff8e8.mp4

Question settings can be customized and synced to all joined players

Other players can be joined entering their Username into the form.

## How It's Made

**Tech Used:** HTML, CSS, JavaScript, TypeScript, Peer.js, WebRTC, OpenTDB API

The core game is built based on the OpenTDB API - a free to use trivia API database of over 4,000 questions - by fetching a customizable amount of questions, and displaying them to the user, tallying up the correct/incorrect answers at the end of the round.

Of course the complex part of this is the zero-backend multiplayer based on Peer.js, which allows for a peer-to-peer connection between two or more users, allowing for the game to be played with multiple players.

The underlying architecture is actually based on the multiplayer aspect of the code, so when playing the game alone technically you are connecting to yourself, and playing a multiplayer game with yourself.

## Optimizations

The game is built to be as lightweight as possible, at this expense of this goal some feature were sacrificed, primarily being the concept of a lobby, and built in matchmaking. Adding these, in addition to saving game stats for display on a leaderboard, authenticated user account, and even more features could be added with the addition of a backend.

## Lessons Learned

Implementing the multi-client multiplayer was tricky, but during the process I learned a lot about WebRTC and Peer.js, and since I chose a game that was relatively complex - a infinite amount of players, multiple stages, having to keep all this in sync, etc - I'm now more confident in my ability to build any simpler multiplayer game.
