"""This file is used to watch for changes in the backend code and restart the server automatically"""

import os
import subprocess
import sys
from subprocess import Popen

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


class FileChangeHandler(FileSystemEventHandler):
    def __init__(self, command, process=None):
        super().__init__()
        self.command = command
        self.process = process

    def on_modified(self, event):
        file_extension = os.path.splitext(event.src_path)[1]
        if file_extension != ".py":
            return
        if self.path_contains_directory(event.src_path, "generated_files"):
            return
        print("Detected change on file:", event.src_path, "reloading...")
        if self.process is not None:
            self.terminate_process(self.process)
        self.process = self.start_process(self.command)

    def start_process(self, command):
        self.process = Popen(command)
        return self.process

    def terminate_process(self, process):
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()

    def path_contains_directory(self, path: str, directory_name: str):
        normalized_path = os.path.normpath(path)
        directories = normalized_path.split(os.path.sep)
        return directory_name in directories


if __name__ == "__main__":
    command = [sys.executable, "app.py", "run"]
    server_process = Popen(command)

    event_handler = FileChangeHandler(command)
    event_handler.process = server_process
    observer = Observer()
    observer.schedule(event_handler, path=".", recursive=True)
    observer.start()

    try:
        while True:
            observer.join(1)
    except KeyboardInterrupt:
        observer.stop()

    event_handler.terminate_process(server_process)

    observer.join()
