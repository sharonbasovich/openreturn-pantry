export const OUTBOUND_LOOP = {
  "version": 1,
  "title": "Loop reboarding regression",
  "serviceDay": "2026-11-09",
  "dataKind": "synthetic",
  "stops": [
    {
      "id": "A",
      "name": "A"
    },
    {
      "id": "B",
      "name": "B"
    },
    {
      "id": "C",
      "name": "C"
    },
    {
      "id": "P",
      "name": "P"
    }
  ],
  "pantryStop": "P",
  "origins": [
    {
      "id": "o",
      "stopId": "A",
      "label": "Loop origin",
      "leaveAfter": 480,
      "homeBy": 600,
      "maxAwayMinutes": 120
    }
  ],
  "connections": [
    {
      "id": "ab",
      "tripId": "loop",
      "from": "A",
      "to": "B",
      "departure": 480,
      "arrival": 490
    },
    {
      "id": "bc",
      "tripId": "loop",
      "from": "B",
      "to": "C",
      "departure": 495,
      "arrival": 505
    },
    {
      "id": "cb",
      "tripId": "loop",
      "from": "C",
      "to": "B",
      "departure": 510,
      "arrival": 520
    },
    {
      "id": "bp",
      "tripId": "loop",
      "from": "B",
      "to": "P",
      "departure": 530,
      "arrival": 540
    },
    {
      "id": "pa",
      "tripId": "back",
      "from": "P",
      "to": "A",
      "departure": 560,
      "arrival": 580
    }
  ],
  "settings": {
    "baselineStart": 540,
    "earliestStart": 540,
    "latestStart": 540,
    "stepMinutes": 1,
    "openMinutes": 30,
    "visitMinutes": 10,
    "transferMinutes": 5,
    "maxTransfers": 1
  }
};
export const RETURN_LOOP = {
  "version": 1,
  "title": "Return loop",
  "serviceDay": "2026-11-09",
  "dataKind": "synthetic",
  "stops": [
    {
      "id": "A",
      "name": "A"
    },
    {
      "id": "B",
      "name": "B"
    },
    {
      "id": "C",
      "name": "C"
    },
    {
      "id": "P",
      "name": "P"
    }
  ],
  "pantryStop": "P",
  "origins": [
    {
      "id": "o",
      "stopId": "A",
      "label": "Loop origin",
      "leaveAfter": 480,
      "homeBy": 600,
      "maxAwayMinutes": 150
    }
  ],
  "connections": [
    {
      "id": "ap",
      "tripId": "out",
      "from": "A",
      "to": "P",
      "departure": 480,
      "arrival": 490
    },
    {
      "id": "pb",
      "tripId": "loop",
      "from": "P",
      "to": "B",
      "departure": 560,
      "arrival": 570
    },
    {
      "id": "bc",
      "tripId": "loop",
      "from": "B",
      "to": "C",
      "departure": 575,
      "arrival": 580
    },
    {
      "id": "cb",
      "tripId": "loop",
      "from": "C",
      "to": "B",
      "departure": 582,
      "arrival": 587
    },
    {
      "id": "ba",
      "tripId": "loop",
      "from": "B",
      "to": "A",
      "departure": 590,
      "arrival": 600
    }
  ],
  "settings": {
    "baselineStart": 540,
    "earliestStart": 540,
    "latestStart": 540,
    "stepMinutes": 1,
    "openMinutes": 30,
    "visitMinutes": 10,
    "transferMinutes": 5,
    "maxTransfers": 1
  }
};
