const defaultFillColor = bluepalette[0];

class Component {
  constructor({name = Math.random()*1000, x = 0, y = 0, side = defaultBoxSide, fillColor = defaultFillColor, textColor = charcoalGrey}) {
    this.name = name;
    this.side = side;
    this.x = x
    this.y = y
    this.fillColor = fillColor
    this.textColor = textColor
  }

  // Method
  draw() {
      mybox(this.x, this.y, this.side, this.fillColor, this.name, this.textColor)
  }
  
  updateFillColor(newColor) {
    this.fillColor = newColor
  }
  
  rotateFillColorPalette(pallette) {
    if (pallette.indexOf(this.fillColor) < 0) {
       this.fillColor = pallette[0]; 
    } else {
      let currentColorIndex = pallette.indexOf(this.fillColor);
      let newColorIndex = (currentColorIndex + 1) % pallette.length;
      this.fillColor = pallette[newColorIndex];
    }
    
  }
  
  coordinates() {
    return {x: this.x, y: this.y}
  }
  
  isPointWithin(x, y, delta) {
    return x > this.x-delta && x < this.x + this.side + delta && y > this.y - delta && y < this.y + this.side + delta
  }
  
  shift(newX, newY) {
    this.x = newX
    this.y = newY
  }
  
  centre() {
    return {x: this.x + (this.side/2), y: this.y + (this.side/2)}
  }
}

function mybox(x, y, side, fillColor, textString, textColor) {
  // Add shadow effect
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.2)';
  drawingContext.shadowBlur = 5;
  drawingContext.shadowOffsetX = 2;
  drawingContext.shadowOffsetY = 2;
  
  // Draw rounded rectangle
  fill(fillColor);
  stroke(fillColor);
  rect(x, y, side, side, 10); // 10 is the corner radius
  
  // Reset shadow
  drawingContext.shadowColor = 'transparent';
  
  // Center text in the box
  fill(textColor);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(12);
  textStyle(NORMAL);
  text(textString, x + side/2, y + side/2);
  
  // Reset text alignment for other elements
  textAlign(LEFT, TOP);
}