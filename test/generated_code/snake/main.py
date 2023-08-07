import uvicorn
from game_logic import app

def main():
    print("Starting FastAPI application...")
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()