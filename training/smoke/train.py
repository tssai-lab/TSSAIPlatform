import json
import os
import time
import urllib.request


def callback(payload):
    url = os.environ["CALLBACK_URL"]
    token = os.environ["CALLBACK_TOKEN"]
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Training-Callback-Token": token,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


training_id = os.environ["TRAINING_ID"]
callback({"trainingId": training_id, "status": "running", "progress": 25})
time.sleep(3)
callback({"trainingId": training_id, "status": "running", "progress": 75})
time.sleep(3)
callback({
    "trainingId": training_id,
    "status": "success",
    "progress": 100,
    "runId": "smoke-run-" + training_id[-8:],
    "metrics": {"smokeLoss": 0.01, "smokeAccuracy": 0.99},
    "logPath": "smoke://train.log",
    "outputPath": "smoke://outputs",
})
