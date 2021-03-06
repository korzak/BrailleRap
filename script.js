paper.install(window);

$(document).ready( function() {

	let canvas = document.getElementById("paperCanvas")

	paper.setup(canvas);

	// global object to store all parameters: braille dimensions are standards
	let braille = { marginWidth: 20, marginHeight: 20, paperWidth: 170, paperHeight: 125, letterWidth: 2.54, dotRadius: 1.25, letterPadding: 3.75, linePadding: 5.3, headDownPosition: -2.0, headUpPosition: 10, speed: 5000, delta: false, language: "6 dots" };

	let pixelMillimeterRatio = null;

	let text = '';
	let gcode = '';

	// Replace a char at index in a string
	function replaceAt(s, n, t) {
	    return s.substring(0, n) + t + s.substring(n + 1);
	}

	let latinToBraille = new Map(); 		// get braille dot indices from char
	let dotMap = null;					// get dot order from x, y dot coordinates
	let numberPrefix = null; 			// the indices of the number prefix of the language

	let gcodeSetAbsolutePositioning = function() {
		return 'G90;\r\n'
	}

	let gcodeSetSpeed = function(speed) {
		return 'G1 F' + speed + ';\r\n'
	}

	let gcodeTo = function(X, Y, Z) {
		let code = ''
		if(X == null && Y == null && Z == null) {
			throw new Error("Null position when moving")
		}
		if(X != null) {
			code += ' X' + X
		}
		if(Y != null) {
			code += ' Y' + Y
		}
		if(Z != null) {
			code += ' Z' + Z
		}
		code += ';\r\n'
		return code
	}

	let gcodeGoTo = function(X, Y, Z) {
		return 'G0' + gcodeTo(X, Y, Z)
	}

	let gcodeMoveTo = function(X, Y, Z) {
		return 'G1' + gcodeTo(X, Y, Z)
	}

	// Draw braille and generate gcode
	let brailleToGCode = function() {
		let is8dot = braille.language.indexOf("8 dots") >= 0

		// Compute the pixel to millimeter ratio 
		let paperWidth = braille.paperWidth;
		let paperHeight = braille.paperHeight;

		let canvasWidth = canvas.width / window.devicePixelRatio;
		let canvasHeight = canvas.height / window.devicePixelRatio;

		let realRatio = paperWidth / paperHeight;
		let pixelRatio = canvasWidth / canvasHeight;

		let finalWidthPixel = 0;
		let finalHeightPixel = 0;

		let pixelMillimeterRatio = Math.min(canvasWidth / paperWidth, canvasHeight / paperHeight)
		
		// Up / down position of the printer head, in millimeter
		let headUpPosition = braille.headUpPosition;
		let headDownPosition = braille.headDownPosition;

		project.clear();

		// Start GCode

		gcode = gcodeSetAbsolutePositioning()
		gcode += gcodeSetSpeed(braille.speed)
		gcode += gcodeMoveTo(null, null, headUpPosition)

		// initialize position: top left + margin
		let currentX = braille.marginWidth;
		let currentY = braille.marginHeight;
		let letterWidth = braille.letterWidth;

		// draw bounds
		let bounds = new Path.Rectangle(0, 0, Math.max(braille.paperWidth * pixelMillimeterRatio, 0), Math.max(0, braille.paperHeight * pixelMillimeterRatio));
		bounds.strokeWidth = 1;
		bounds.strokeColor = 'black';

		let isWritingNumber = false;

		let textCopy = '' + text

		// iterate through each char: draw braille code and add gcode
		for(let i = 0 ; i < textCopy.length ; i++) {
			let char = textCopy[i]

			// check special cases: 
			let charIsCapitalLetter = is8dot ? false : /[A-Z]/.test(char)
			let charIsLineBreak = /\r?\n|\r/.test(char)
			
			// If char is line break: reset currentX and increase currentY
			if(charIsLineBreak) {
				currentY += (is8dot ? 2 : 3) * letterWidth + braille.linePadding;
				currentX = braille.marginWidth;

				if(currentY > braille.paperHeight - braille.marginHeight) { 				// if there is not enough space on paper: stop
					break;
				}
				continue;
			}

			// Check if char exists in map 
			if(!latinToBraille.has(char.toLowerCase())) {
				throw new Error('Character ' + char + ' was not translated in braille.')	
			}
			
			let indices = latinToBraille.get(char);

			// handle special cases:
			if(!isWritingNumber && !isNaN(parseInt(char))) { 			// if we are not in a number sequence and char is a number: add prefix and enter number sequence
				indices = numberPrefix;
				i--; 													// we will reread the same character
				isWritingNumber = true;
			} else if(isWritingNumber && char == ' ') {
				isWritingNumber = false;
			} else if( charIsCapitalLetter ) { 							// if capital letter: add prefix, lowerCase letter and reread the same char
				indices = [4, 6];
				textCopy = replaceAt(textCopy, i, textCopy[i].toLowerCase());
				i--;
			}

			// compute corresponding printer coordinates
			let gx = braille.paperWidth - currentX;
			let gy = -currentY; 				// canvas y axis goes downward, printers goes upward

			if(braille.delta) { 				// delta printers have their origin in the center of the sheet
				gx -= braille.paperWidth / 2;
				gy += braille.paperHeight / 2;
			} else {
				gy += braille.paperHeight;
			}

			// add gcode
			gcode += gcodeMoveTo(gx, gy)

			// Draw braille char and compute gcode
			let charGroup = new Group();
			
			// Iterate through all indices
			for(let y = 0 ; y < (is8dot ? 4 : 3) ; y++) {
				for(let x = 0 ; x < 2 ; x++) {

					if(indices.indexOf(dotMap[x][y]) != -1) { 			// if index exists in current char: draw the dot
						let px = currentX + x * letterWidth
						let py = currentY + y * letterWidth
						let dot = new Path.Circle(new Point(px * pixelMillimeterRatio, py * pixelMillimeterRatio), (braille.dotRadius / 2) * pixelMillimeterRatio);
						dot.fillColor = 'black';

						charGroup.addChild(dot);

						// Compute corresponding gcode position
						if(x > 0 || y > 0) {

							gx = braille.paperWidth - px;
							gy = -py;						// canvas y axis goes downward, printers goes upward

							if(braille.delta) { 			// delta printers have their origin in the center of the sheet
								gx -= braille.paperWidth / 2;
								gy += braille.paperHeight / 2;
							} else {
								gy += braille.paperHeight;
							}

							gcode += gcodeMoveTo(gx, gy)
						}
						
						// move printer head
						gcode += gcodeMoveTo(null, null, headDownPosition)
						gcode += gcodeMoveTo(null, null, headUpPosition)
					}
				}
			}

			// update currentX & currentY
			currentX += braille.letterWidth + braille.letterPadding;

			// Test if there is enough room on the line to draw the next character
			if(currentX + braille.letterWidth + braille.dotRadius > braille.paperWidth - braille.marginWidth) { // if we can't: go to next line
				currentY += (is8dot ? 2 : 3) * letterWidth + braille.linePadding;
				currentX = braille.marginWidth;
			}

			if(currentY > braille.paperHeight - braille.marginHeight) { 				// if there is not enough space on paper: stop
				break;
			}
		}

		$("#gcode").val(gcode)
	}

	brailleToGCode()

	// initializeLatinToBraille from corresponding language file
	function initializeLatinToBraille() {

		numberPrefix = languages[braille.language].numberPrefix

		dotMap = languages[braille.language].dotMap
		
		if(dotMap == null) {
			throw new Error('Dot eight map.')
		}

		// Read in braille description file
		// latinToBraille.set('a', [1, 2]);
		// latinToBraille.set('b', [1, 4, 5]);
		let brailleJSON = languages[braille.language].latinToBraille
		
		for(let char in brailleJSON) {
			latinToBraille.set(char, brailleJSON[char])
		}
	}
	initializeLatinToBraille();

	// Create GUI
	var gui = new dat.GUI({ autoPlace: false });

	var customContainer = document.getElementById('gui');
	customContainer.appendChild(gui.domElement);

	$(gui.domElement).find('.close-button').remove()

	dat.GUI.toggleHide = () => {}

	let createController = function(name, min, max, callback, folder) {
		let f = folder != null ? folder : gui
		let controller = f.add(braille, name, min, max);
		controller.onChange(callback != null ? callback : brailleToGCode);
		controller.onFinishChange(callback != null ? callback : brailleToGCode);
	}

	let paperDimensionsFolder = gui.addFolder('Paper dimensions');
	createController('paperWidth', 1, 1000, null, paperDimensionsFolder);
	createController('paperHeight', 1, 1000, null, paperDimensionsFolder);
	createController('marginWidth', 0, 100, null, paperDimensionsFolder);
	createController('marginHeight', 0, 100, null, paperDimensionsFolder);
	paperDimensionsFolder.open();

	let charDimensionsFolder = gui.addFolder('Char dimensions');
	createController('letterWidth', 1, 100, null, charDimensionsFolder);
	createController('dotRadius', 1, 30, null, charDimensionsFolder);
	createController('letterPadding', 1, 30, null, charDimensionsFolder);
	createController('linePadding', 1, 30, null, charDimensionsFolder);
	charDimensionsFolder.open();
	
	let printerSettingsFolder = gui.addFolder('Printer settings');
	createController('headDownPosition', -10, 30, null, printerSettingsFolder);
	createController('headUpPosition', -10, 30, null, printerSettingsFolder);
	createController('speed', 0, 6000, null, printerSettingsFolder);

	createController('delta', null, null, null, printerSettingsFolder);
	printerSettingsFolder.open();

	var languageList = []
	for(let lang in languages) {
		languageList.push(lang)
	}

	createController('language', languageList, null, function() {
		initializeLatinToBraille();
		brailleToGCode();
	});

	// Add download button (to get a text file of the gcode)
	gui.add({saveGCode: function(){
		var a = document.body.appendChild(
			document.createElement("a")
		);
		a.download = "braille.gcode";
		a.href = encodeURI("data:text/plain;charset=utf-8," + gcode);

		a.click(); // Trigger a click on the element
		a.remove();

	}}, 'saveGCode')

	// Update all when text changes
	$('#latin').bind('input propertychange', function(event) {
		text = $("#latin").val();
		$('#braille').val(text);
		brailleToGCode(text);
	})

	// Update all when text changes
	$('#braille').bind('input propertychange', function(event) {
		text = $("#braille").val();
		$('#latin').val(text);
		brailleToGCode(text);
	})

})
