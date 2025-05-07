const movementPercentage = 0.03;

class Message {
  constructor({name = Math.random()*1000, start, end, side = 10, fillColor = pink, strokeColor = pink, text = "", description = "", schema = {}}) {
    this.name = name;
    this.startComponent = start;
    this.endComponent = end;
    this.coords = squareXYFromSquareCentre(start.centre(), side);
    this.side = side;
    this.fillColor = fillColor;
    this.strokeColor = strokeColor;
    this.slider = undefined;
    this.moving = true;
    this.text = text;
    this.description = description;
    this.schema = schema;
  }

  // Method
  draw() {
      fill(this.fillColor);
      noStroke();
      circle(this.coords.x, this.coords.y, 1.75*this.side);
      // rect(this.coords.x, this.coords.y, this.side, this.side)
      stroke(this.strokeColor)
  }
  
  move() {
    let shift = this.getShift(movementPercentage);
    if (this.moving) {
      this.coords.x = (this.coords.x + shift.x)
      this.coords.y = (this.coords.y + shift.y) 
    }
  
  }
  
  stopMoving() {
    this.moving = false;
  }

  hasReached() {
    let shift = this.getShift(movementPercentage)
    let diff = this.getDistanceFromDestination()
    let distance = Math.abs(diff.x) + Math.abs(diff.y)
    return (distance <= (Math.abs(shift.x) + Math.abs(shift.y)))
  }
  
  reset() {
    this.coords = squareXYFromSquareCentre(this.startComponent.centre(), this.side);
    this.moving = true;
  }
  
  getShift(shiftPcnt) {
    let startCoords = squareXYFromSquareCentre(this.startComponent.centre(), this.side);
    let endCoords = squareXYFromSquareCentre(this.endComponent.centre(), this.side);

    let xTotalDist = endCoords.x - startCoords.x
    let yTotalDist = endCoords.y - startCoords.y
    let xshift = xTotalDist * shiftPcnt
    let yshift = yTotalDist * shiftPcnt

    return {x: xshift, y: yshift}
  }
  
  getDistanceFromDestination() {
    let endCoords = squareXYFromSquareCentre(this.endComponent.centre(), this.side);
    return {x: endCoords.x - this.coords.x, y: endCoords.y - this.coords.y}
  }
  
  shiftFromStartCoordsByPercentage(shiftPcnt) {
    let shift = this.getShift(shiftPcnt)
    let startCoords = squareXYFromSquareCentre(this.startComponent.centre(), this.side)
    this.coords.x = (startCoords.x + shift.x)
    this.coords.y = (startCoords.y + shift.y)
  }

  coordinates() {
    return this.coords;
  }
  
  updateFillColor(newColor) {
    this.fillColor = newColor
  }
}

function squareXYFromSquareCentre(coords, side) {
  return {x: coords.x, y: coords.y}
}

function squareCentreFromXY(coords, side) {
  return {x: coords.x, y: coords.y}
}