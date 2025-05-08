function keyPressed() {
  if (keyCode === RIGHT_ARROW) {
    rightKeyPressed = true;
  }
  
  if (keyCode === LEFT_ARROW) {
    leftKeyPressed = true;
  }
  
  // Spacebar => Pause animation
  if (keyCode === " ".charCodeAt() && keyIsDown(SHIFT)) {
    buttons.sliderButton.state = !buttons.sliderButton.state
  }
  
  // Shift + D => Debug animation
  if (keyCode == "D".charCodeAt() && keyIsDown(SHIFT)) {
    debugModeOn = !debugModeOn
  }
  
  // Shift + S => slider mode on
  if (keyCode == "S".charCodeAt() && keyIsDown(SHIFT)) {
    buttons.showSchemaButton.state = !buttons.showSchemaButton.state
  }
  
  // Shift + R => reset current message
  if (keyCode == "R".charCodeAt() && keyIsDown(SHIFT)) {
    buttons.resetButton.state = !buttons.resetButton.state
  }
  
  // Shift + L => reload PlantUML text
  if (keyCode == "L".charCodeAt() && keyIsDown(SHIFT)) {
    buttons.reloadPlantUMLButton.state = true;
  }
}

function keyReleased() {
  if (keyCode === RIGHT_ARROW) {
    rightKeyPressed = false;
  }
  
  if (keyCode === LEFT_ARROW) {
    leftKeyPressed = false;
  }
}