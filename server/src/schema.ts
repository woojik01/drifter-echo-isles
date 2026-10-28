import { MapSchema, Schema, type } from "@colyseus/schema";
export class PlayerState extends Schema {
    @type("string")
    nickname = "Drifter";
    @type("string")
    role = "guest";
    @type("float64")
    x = 268;
    @type("float64")
    y = 268;
    @type("float32")
    hp = 30;
    @type("float32")
    maxHp = 30;
    @type("uint16")
    level = 1;
    @type("int8")
    face = 1;
    @type("float32")
    phase = 0;
    @type("boolean")
    moving = false;
    @type("boolean")
    connected = true;
    @type("boolean")
    ready = false;
    @type("boolean")
    dead = false;
    @type("boolean")
    sailing = false;
    @type("string")
    activity = "";
    @type("string")
    equipment = "[]";
    @type("string")
    carrying = "";
    @type("uint32")
    positionSeq = 0;
    @type("uint32")
    damageSeq = 0;
    @type("uint32")
    attackSeq = 0;
    @type("float32")
    attackDir = 0;
}
export class SharedEntity extends Schema {
    @type("float64")
    homeX = 0;
    @type("float64")
    homeY = 0;
    @type("uint8")
    tier = 0;
    @type("boolean")
    elite = false;
    @type("string")
    targetSessionId = "";
    @type("string")
    id = "";
    @type("string")
    kind = "";
    @type("float64")
    x = 0;
    @type("float64")
    y = 0;
    @type("float32")
    hp = 0;
    @type("float32")
    maxHp = 0;
    @type("boolean")
    dead = false;
    @type("boolean")
    aggroed = false;
    @type("int8")
    face = 1;
    @type("float32")
    anim = 0;
    @type("uint32")
    revision = 0;
    @type("uint32")
    randomSeed = 1;
    @type("uint16")
    lastDamage = 0;
    @type("string")
    lastActorSessionId = "";
}
export class SharedNode extends Schema {
    @type("string")
    id = "";
    @type("string")
    kind = "";
    @type("float64")
    x = 0;
    @type("float64")
    y = 0;
    @type("float32")
    hp = 0;
    @type("float32")
    maxHp = 0;
    @type("boolean")
    dead = false;
    @type("boolean")
    looted = false;
    @type("uint32")
    revision = 0;
    @type("uint32")
    randomSeed = 1;
    @type("uint16")
    lastDamage = 0;
    @type("string")
    lastAction = "";
    @type("string")
    lastActorSessionId = "";
}
export class SharedLoot extends Schema {
    @type("string")
    id = "";
    @type("string")
    ownerSessionId = "";
    @type("float64")
    x = 0;
    @type("float64")
    y = 0;
    @type("string")
    data = "";
    @type("float64")
    expiresAt = 0;
}
export class DrifterRoomState extends Schema {
    @type("uint8")
    worldVersion = 3;
    @type("float64")
    worldTime = 0;
    @type("string")
    progress = "{}";
    @type("string")
    roomCode = "";
    @type("uint32")
    worldSeed = 1;
    @type("boolean")
    started = false;
    @type("string")
    hostSessionId = "";
    @type({ map: PlayerState })
    players = new MapSchema<PlayerState>();
    @type({ map: SharedEntity })
    entities = new MapSchema<SharedEntity>();
    @type({ map: SharedNode })
    nodes = new MapSchema<SharedNode>();
    @type({ map: SharedLoot })
    loot = new MapSchema<SharedLoot>();
}
