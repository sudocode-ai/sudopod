import requests
import json

# Test Case 1: Get Game State
print("Test Case 1: Get Game State")
url = "https://sudocode-ai--a550zy883.modal.run/game_state"
response = requests.get(url)
print("Expected Result: The API should return the current game state, including the snake position, direction, length, food position, score, and game over status.")
print("Actual Result: ", response.text)

# Test Case 2: Update User Input
print("Test Case 2: Update User Input")
url = "https://sudocode-ai--a550zy883.modal.run/user_input/up"
response = requests.post(url, headers={'Content-Type': 'application/json'}, data=json.dumps({"direction": "up"}))
print("Expected Result: The API should update the direction of the snake based on the user input provided in the request body.")
print("Actual Result: ", response.text)

# Check if the direction of the snake has been updated
response = requests.get("https://sudocode-ai--a550zy883.modal.run/game_state")
game_state = response.json()
print("Checking if the direction of the snake has been updated to 'up'")
if game_state["snake"]["direction"] == "up":
    print("Test Case 2: Update User Input - Success")
else:
    print("Test Case 2: Update User Input - Failed")