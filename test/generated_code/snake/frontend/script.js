// frontend/script.js

let gameState = null;
let gameInterval = null;

async function getGameState() {
    const response = await fetch('/game_state');
    const data = await response.json();
    console.log("Fetched game state: ", data);
    return data;
}

async function sendUserInput(direction) {
    const response = await fetch('/user_input', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ direction }),
    });
    const data = await response.json();
    console.log("Sent user input: ", direction);
    return data;
}

function drawGameArea() {
    // TODO: Implement game area drawing
    console.log("Drawing game area");
}

function drawScore() {
    // TODO: Implement score drawing
    console.log("Drawing score");
}

function drawGameOver() {
    // TODO: Implement game over drawing
    console.log("Drawing game over");
}

function handleUserInput(event) {
    let direction = null;
    switch (event.key) {
        case 'ArrowUp':
            direction = 'up';
            break;
        case 'ArrowDown':
            direction = 'down';
            break;
        case 'ArrowLeft':
            direction = 'left';
            break;
        case 'ArrowRight':
            direction = 'right';
            break;
    }
    if (direction) {
        sendUserInput(direction);
    }
}

async function updateGameState() {
    gameState = await getGameState();
    drawGameArea();
    drawScore();
    if (gameState.gameOver) {
        clearInterval(gameInterval);
        drawGameOver();
    }
}

function startGame() {
    gameInterval = setInterval(updateGameState, 1000);
    window.addEventListener('keydown', handleUserInput);
}

window.onload = startGame;