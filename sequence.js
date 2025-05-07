class Sequence {
  constructor({name = Math.random()*1000, messages = []}) {
    this.name = name;
    this.messages = messages
    this.index = 0 // Current active animated message's index
    this.sliderMode = false;
    this.elem = null;
    this.showSchemas = false;
    
    // Sequence percentage
    this.minValue = 0;
    this.maxValue = (100*this.messages.length)-1;
    this.value = 0;
    
    // private
    this.textAreaCoords = {x: 15, y: drawingAreaMaxY + topInfoAreaHeight + 5}; // Positioned between canvas line and first button
    this.textWrapWidth = drawingAreaMaxX - this.textAreaCoords.x;
  }

  // Method that draws current message only
  draw() {
      let currentMsg = this.messages[this.index];
      currentMsg.draw()
      fill(black);
      stroke(black);
      textAlign(CENTER, CENTER);
      text("" + (this.index+1), currentMsg.coords.x, currentMsg.coords.y);
      textAlign(LEFT, TOP);  // Reset text alignment

      // Message info text
      let coords = this.textAreaCoords, textWrapWidth = this.textWrapWidth;
      // Message name
      fill(periwinkle);
      stroke(periwinkle);
      text((this.index+1) + ": " +  currentMsg.text, coords.x, coords.y, textWrapWidth)
      // Message description
      fill(black);
      stroke(black);
      text(currentMsg.description, coords.x, coords.y + 15, textWrapWidth)
      
      // Message schema - moved below description with proper spacing
      if (this.showSchemas) {
        fill(charcoalGrey);
        stroke(charcoalGrey);
        textSize(11);  // Slightly smaller for schema
        textStyle(ITALIC);
        let schemaText = JSON.stringify(currentMsg.schema, null, 2);
        text(schemaText, coords.x, coords.y + 35, textWrapWidth);  // Moved up to leave space for separator line
        textSize(12);  // Reset text size
        textStyle(NORMAL);  // Reset text style
      }
    
      if (this.sliderMode) {
        stroke(pink);
        let start = currentMsg.startComponent, end = currentMsg.endComponent;
        let startShift = start.side / 2, endShift = end.side / 2;
        fill(skyblue)
        stroke(skyblue)
        circle(start.x+startShift, start.y+startShift, 10);
        square(end.x+endShift-5, end.y+endShift-5, 10)
        stroke(pink);
        drawingContext.setLineDash([0.5, 3]);
        line(start.x + startShift, start.y + startShift, end.x + endShift, end.y + endShift);
        drawingContext.setLineDash([]);
      }
  }
  
  enableSlider() {
    this.sliderMode = true; 
    if (this.slider == undefined) {
      let initial = 50;
      let min = 0, max = (100*this.messages.length)-1, step = 3;
      this.slider = createSlider(min, max, this.value, step);
    } else {
      this.slider.show();
    }
  }
  
  disableSlider() {
    if (this.slider != undefined) {
        this.slider.hide();
    }
    this.sliderMode = false;
  }
  
  showSchema() {
    this.showSchemas = true;
  }
  
  hideSchema() {
    this.showSchemas = false;
  }
  
  moveSliderByX(shift) {
    let newValue = this.slider.value() + shift;
    this.slider.value(newValue)
  }
  
  animate() {
    if (this.sliderMode) {
      this.index = Math.floor(this.slider.value() / 100);
      let shiftPcnt = (this.slider.value() % 100) / 100;
      this.messages[this.index].shiftFromStartCoordsByPercentage(shiftPcnt);
    } else {
      this.messages[this.index].move();
      this.value += 3;
      this.value = this.value % (100*this.messages.length);
      if (this.slider) {
        this.slider.value(this.value); 
      }
    }
    
    // Activations: when messages reach destinations
    if (this.messages[this.index].hasReached()) {
      this.messages[this.index].endComponent.rotateFillColorPalette(bluepalette)
      this.index = (this.index + 1) % this.messages.length;
      this.messages[this.index].reset()
      if (this.index == 0) {
        for (var msg of this.messages) {
          msg.startComponent.updateFillColor(bluepalette[0])
        }
      }
    }
  }

  reset() {
    for (const msg of this.messages) {
      msg.reset();
    }
  }
  
  isCurrentMessageClicked(x, y) {
    let currentMsg = this.messages[this.index];
    let widthPad = 40, heightPad = 40;
    return isXYWithinBox(x, y, currentMsg.coords, widthPad, heightPad);
  }
  
  onClick(x, y) {
    if (!this.isCurrentMessageClicked(x, y)) {
      return
    }

    let currentMsg = this.messages[this.index];
    if (this.elem) {
      currentMsg.updateFillColor(pink);
      this.elem.remove();
      this.elem = null;
    } else {
      this.elem = createElement('h5', JSON.stringify(currentMsg.schema, null, 2));
      let coords = this.textAreaCoords, textWrapWidth = this.textWrapWidth;
      this.elem.position(coords.x, coords.y + 40);
      currentMsg.updateFillColor(indigo);
    }
  }
  
  debugAnimation() {
    for (const [index, msg] of this.messages.entries()) {
      (text("index: " + index, 100, 100+(index*30)))
      text("x: " + str(this.messages[index].coords.x), 100, 110+(index*30))
      text("y: " + str(this.messages[index].coords.y), 100, 120+(index*30));
    }
  }
}

function isXYWithinBox(x, y, coords, widthPad, heightPad) {
  let isWithinX = x > coords.x && x < coords.x + widthPad;
  let isWithinY = y > coords.y && y < coords.y + heightPad;
  return isWithinX && isWithinY
}