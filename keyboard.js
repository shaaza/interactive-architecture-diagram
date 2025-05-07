
function keyPressed() {
  if (keyCode === RIGHT_ARROW) {
    rightKeyPressed = true;
  }
  
  if (keyCode === LEFT_ARROW) {
    leftKeyPressed = true;
  }
  
  // Spacebar => Pause animation
  if (keyCode === " ".charCodeAt() ) {
    buttons.sliderButton.state = !buttons.sliderButton.state
  }
  
  // d => Debug animation
  if (keyCode == "D".charCodeAt() ) {
    debugModeOn = !debugModeOn
  }
  
  // s => slider mode on
  if (keyCode == "S".charCodeAt()) {
    buttons.showSchemaButton.state = !buttons.showSchemaButton.state
  }
  
  // r => reset current message
  if (keyCode == "R".charCodeAt()) {
    buttons.resetButton.state = !buttons.resetButton.state
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