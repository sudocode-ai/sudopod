from fastapi import FastAPI
from pydantic import BaseModel
import random
import logging
from fastapi.staticfiles import StaticFiles

# Initialize logger
logger = logging.getLogger(__name__)

# Initialize FastAPI application
app = FastAPI()

class Snake(BaseModel):
    position: list
    direction: str
    length: int

class Food(BaseModel):
    position: list

class GameState(BaseModel):
    score: int
    game_over: bool
    snake: Snake
    food: Food


app.mount("/static", StaticFiles(directory="frontend", html=True), name="frontend")


# Initialize game state
game_state = GameState(score=0, game_over=False, snake=Snake(position=[5, 5], direction="up", length=1), food=Food(position=[10, 10]))

@app.get("/game_state")
async def get_game_state():
    logger.info("Game state requested")
    return game_state

@app.post("/user_input/{direction}")
def update_direction(direction: str):
    logger.info(f"User input received: {direction}")
    if direction in ["up", "down", "left", "right"]:
        game_state.snake.direction = direction
        logger.info(f"Snake direction updated to: {direction}")
        return {"message": "Direction updated successfully"}
    else:
        logger.error(f"Invalid direction: {direction}")
        return {"message": "Invalid direction"}

@app.post("/start_game")
def start_game():
    logger.info("Game start requested")
    game_state.score = 0
    game_state.game_over = False
    game_state.snake = Snake(position=[5, 5], direction="up", length=1)
    game_state.food = Food(position=[10, 10])

def move_snake():
    logger.info("Moving snake")
    if game_state.snake.direction == "up":
        game_state.snake.position[1] += 1
    elif game_state.snake.direction == "down":
        game_state.snake.position[1] -= 1
    elif game_state.snake.direction == "left":
        game_state.snake.position[0] -= 1
    elif game_state.snake.direction == "right":
        game_state.snake.position[0] += 1

    # Check for collision with self or edge
    if game_state.snake.position[0] < 0 or game_state.snake.position[0] > 20 or game_state.snake.position[1] < 0 or game_state.snake.position[1] > 20:
        game_state.game_over = True
        logger.info("Game over: Snake collided with edge")

    # Check for collision with food
    if game_state.snake.position == game_state.food.position:
        game_state.score += 1
        game_state.snake.length += 1
        game_state.food.position = [random.randint(0, 20), random.randint(0, 20)]
        logger.info("Snake ate food")