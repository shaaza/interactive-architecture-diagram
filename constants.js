const topInfoAreaHeight = 5;
const drawingAreaMaxX = 600;
const drawingAreaMaxY = 600;
const infoAreaHeight = 200;
const defaultIndent = 15;
const defaultBoxSide = 50;
const totalAreaMaxX = drawingAreaMaxX;
const totalAreaMaxY = drawingAreaMaxY + infoAreaHeight + topInfoAreaHeight;

const leftTopBoxCoords = {x: defaultIndent, y: defaultIndent + topInfoAreaHeight };

let rightTopCornerX = drawingAreaMaxX-defaultBoxSide-defaultIndent
const rightTopBoxCoords = {x: rightTopCornerX, y: defaultIndent + topInfoAreaHeight};

let leftBottomCornerY = drawingAreaMaxY - defaultBoxSide - defaultIndent;
const leftBottomBoxCoords = {x: defaultIndent, y: leftBottomCornerY + topInfoAreaHeight};

let rightBottomCornerX = drawingAreaMaxX - defaultBoxSide - defaultIndent;
let rightBottomCornerY = drawingAreaMaxY - defaultBoxSide - defaultIndent;
const rightBottomBoxCoords = {x: rightBottomCornerX, y: rightBottomCornerY + topInfoAreaHeight};