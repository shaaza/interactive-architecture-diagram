let animateMessages = true;
let leftKeyPressed = false;
let rightKeyPressed = false;
let debugModeOn = false;
let boxes = {};
let messages = [];
let sequences = [];
let currentPlantUMLText = "";
let plantumltextarea = null;

function parsePlantUMLFromTextBoxIfChanged(textarea) {
  if (textarea == null || currentPlantUMLText == textarea.value()) {
    return
  }

  try {
    let parsed = parsePlantUMLSeq(textarea.value());
    let defaultPositions = calculateTreePositions(parsed.boxes.length);
    let boxesArr = parsed.boxes.map((name, index) => (new Component({name: name, x: defaultPositions[index].x, y: defaultPositions[index].y})))
    boxes = {};
    for (const box of boxesArr) {
      boxes[box.name] = box
    }

    messages = parsed.messages.map(msg => (new Message({ start:         boxes[msg.start], end: boxes[msg.end], text: msg.text, description: msg.description, schema: msg.schema})));

    let sequence1 = new Sequence({name: "my sequence", messages: messages});

    sequences = [sequence1];

  } catch(error) {
        print(error);
        return
  }

  currentPlantUMLText = plantumltextarea.value();
}

function setup() {
  createCanvas(totalAreaMaxX, totalAreaMaxY);
  if (buttons.sliderButton.state) {
    text("slider mode", 100, 100);
  }
  
  // Create and style the PlantUML text box
  plantumltextarea = createElement('textarea');
  plantumltextarea.elt.value = definition;
  plantumltextarea.elt.rows = 40;
  plantumltextarea.elt.cols = 60;  // Reduced width for better layout
  plantumltextarea.position(drawingAreaMaxX + 20, 20);  // Position to the right of canvas
  
  // Style the textarea
  plantumltextarea.style('font-family', 'monospace');
  plantumltextarea.style('font-size', '12px');
  plantumltextarea.style('padding', '10px');
  plantumltextarea.style('border', '1px solid #ccc');
  plantumltextarea.style('border-radius', '4px');
  plantumltextarea.style('background-color', '#f8f8f8');
  plantumltextarea.style('resize', 'vertical');
  
  parsePlantUMLFromTextBoxIfChanged(plantumltextarea);
}


function draw() {
  parsePlantUMLFromTextBoxIfChanged(plantumltextarea);
  background(white);
  line(0, topInfoAreaHeight, drawingAreaMaxX, topInfoAreaHeight);
  line(0, drawingAreaMaxY+topInfoAreaHeight, drawingAreaMaxX, drawingAreaMaxY+topInfoAreaHeight);
  
  // Draw separator line between canvas and buttons
  stroke(lightGrey);
  strokeWeight(1);
  line(0, drawingAreaMaxY + topInfoAreaHeight, drawingAreaMaxX, drawingAreaMaxY + topInfoAreaHeight);
  
  // Draw separator line between text area and buttons
  stroke(lightGrey);
  strokeWeight(1);
  line(0, drawingAreaMaxY + topInfoAreaHeight + 60, drawingAreaMaxX, drawingAreaMaxY + topInfoAreaHeight + 60);  // Moved down to leave space for schema
  
  // Draw boxes
  for (const [name, b] of Object.entries(boxes)) {
    b.draw();
  }
  
  // Draw buttons
  for (const [name, b] of Object.entries(buttons)) {
    drawButton(b)
  }

  for (const sequence of sequences) {
    sequence.draw();
    sequence.animate();
  }
  
  // Slider button logic
  for (const sequence of sequences) {
    if  (buttons.sliderButton.state) {
      sequence.enableSlider();
    } else {
      sequence.disableSlider();
    }
    
    if (buttons.showSchemaButton.state) {
      sequence.showSchema();
    } else {
      sequence.hideSchema();
    }
  }
  
  // Reset button Logic
  if (buttons.resetButton.state) {
      for (const sequence of sequences) {
        sequence.reset();
    }
    buttons.resetButton.state = false;
  }
  
  
  // Keyboard step through
  if (rightKeyPressed) {
    sequences[0].moveSliderByX(5);
  }
  if (leftKeyPressed) {
    sequences[0].moveSliderByX(-5);
  }

  // Message debug line
  if (debugModeOn) {
    sequences[0].debugAnimation();    
  }
}

function mouseDragged() {
  // Boxes are draggable
  for (const [name, b] of Object.entries(boxes)) {
    if (b.isPointWithin(mouseX, mouseY, 20)) {
      b.shift(mouseX, mouseY);
    }
  }
}

function mouseClicked() {
  // Buttons are clickable
  for (const [name, button] of Object.entries(buttons)) {
    let widthPad = 40, heightPad = 10;
    if (isXYWithinBox(mouseX, mouseY, button.coords, widthPad, heightPad)) {
      buttons[name].state = !button.state;
    }
  }
  
  // Active messages are clickable
  for (const sequence of sequences) {
    sequence.onClick(mouseX, mouseY)
  }
}

function isXYWithinBox(x, y, coords, widthPad, heightPad) {
  let isWithinX = x > coords.x && x < coords.x + widthPad;
  let isWithinY = y > coords.y && y < coords.y + heightPad;
  return isWithinX && isWithinY
}