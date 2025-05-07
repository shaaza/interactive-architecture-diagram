let buttons = {
  sliderButton: {
    state: false, 
    activeText: "pause & slide off (spacebar)", 
    inactiveText: "pause & slide on (spacebar)", 
    coords: {x: 10, y: drawingAreaMaxY + topInfoAreaHeight + 70}
  },
  resetButton: {
    state: false,
    activeText: "reset current message (r)",
    inactiveText: "reset current message (r)",
    coords: {x: 10, y: drawingAreaMaxY + topInfoAreaHeight + 90}
  },
  showSchemaButton: {
    state: false,
    activeText: "hide schemas (s)",
    inactiveText: "show schemas (s)",
    coords: {x: 10, y: drawingAreaMaxY + topInfoAreaHeight + 110}
  }
};

function drawButton(button) {
  let state = button.state;
  let textOn = button.activeText, textOff = button.inactiveText;
  let x = button.coords.x, y = button.coords.y;
  
  // Add shadow effect
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.2)';
  drawingContext.shadowBlur = 3;
  drawingContext.shadowOffsetX = 1;
  drawingContext.shadowOffsetY = 1;

  // Draw button background
  if (state) {
    fill(sage);
    stroke(periwinkle);
  } else {
    fill(white);
    stroke(sage);
  }
  strokeWeight(2);
  rect(x, y, 40, 15, 5);

  // Reset shadow
  drawingContext.shadowColor = 'transparent';
  
  // Draw button text
  noStroke();
  textAlign(LEFT, CENTER);
  fill(charcoalGrey);
  textSize(12);
  text(state ? textOn : textOff, x + 50, y + 7.5);
  
  // Reset text alignment
  textAlign(LEFT, TOP);
  strokeWeight(1);
}
