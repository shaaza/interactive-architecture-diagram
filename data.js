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

function calculateTreePositions(numComponents) {
  // Calculate how many levels we need
  const levels = Math.ceil(Math.log2(numComponents + 1));
  
  // Calculate spacing between components
  const horizontalSpacing = drawingAreaMaxX / (Math.pow(2, levels - 1) + 1);
  const verticalSpacing = (drawingAreaMaxY - topInfoAreaHeight) / (levels + 1);
  
  const positions = [];
  
  // For each component, calculate its position
  for (let i = 0; i < numComponents; i++) {
    // Calculate which level this component is in
    const level = Math.floor(Math.log2(i + 1));
    
    // Calculate position within the level
    const positionInLevel = i - (Math.pow(2, level) - 1);
    const componentsInLevel = Math.pow(2, level);
    
    // Calculate x position (centered in its level)
    const x = horizontalSpacing * (positionInLevel + 1) * (Math.pow(2, levels - level - 1));
    
    // Calculate y position (based on level)
    const y = topInfoAreaHeight + verticalSpacing * (level + 1);
    
    positions.push({x, y});
  }
  
  return positions;
}