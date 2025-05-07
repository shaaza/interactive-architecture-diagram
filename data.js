function parsePlantUMLSeq(desc) {
    const lines = desc.trim().split('\n');
    const nonEmptyLines = lines.filter(x => x.trim().length > 0)
    const startIndex = nonEmptyLines.indexOf("@startuml")+1;
    const endIndex = nonEmptyLines.indexOf("@enduml");  
    const relevantLines  =nonEmptyLines.slice(startIndex, endIndex).map(x => x.trim());
    
    // Loop through array until you find a message arrow
    const parsedBoxes = new Set();
    const parsedMessages = [];
    for (let i = 0; i < relevantLines.length; i++) {
        if (relevantLines[i].includes("->")) {
            // back track to previous message or start to see if there are schema messages
            let description = "", schema = {};
            for (let j = i-1; j >= 0; j--) {
                if (relevantLines[j].includes("->")) {
                    break
                }
                if (relevantLines[j].startsWith("--description:")) {
                    description = relevantLines[j].split("--description:")[1];
                }
    
                if (relevantLines[j].startsWith("--schema:")) {
                    schema = relevantLines[j].split("--schema:")[1];
                }
            }
    
            let boxes = getBoxes(relevantLines[i]);
            let message = getMessage(relevantLines[i], boxes, description, schema);
            for (const box of boxes) {
                parsedBoxes.add(box)
            }
            parsedMessages.push(message)
        }
    }

    return {boxes: Array.from(parsedBoxes), messages: parsedMessages}
}

function getMessage(line, boxes, description, schema) {
    let text = line.split(":")[1].trim();
    return {start: boxes[0], end: boxes[1], text: text, description: description, schema: schema }
}

function getBoxes(line) {
    let box1 = line.split("->")[0].trim();
    let box2 = line.split("->")[1].split(":")[0].trim();
    return [box1, box2]
}

let defaultPositions = [leftTopBoxCoords, rightTopBoxCoords, rightBottomBoxCoords, leftBottomBoxCoords]
// let parsed = parsePlantUMLSeq(definition);
// let boxesArr = parsed.boxes.map((name, index) => (new Component({name: name, x: defaultPositions[index].x, y: defaultPositions[index].y})))
// let boxes = {}
// for (const box of boxesArr) {
//   boxes[box.name] = box
// }

// let messages = parsed.messages.map(msg => (new Message({ start: boxes[msg.start], end: boxes[msg.end], text: msg.text, description: msg.description, schema: msg.schema})));
