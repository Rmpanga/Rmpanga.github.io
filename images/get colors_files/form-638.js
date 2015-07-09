// Spectrum Colorpicker v1.0.9
// https://github.com/bgrins/spectrum
// Author: Brian Grinstead
// License: MIT

/* has CUSTOM changes made by Jonas and Cameron,
 * that should be carried over when we upgrade Spectrum.
 * --you can find these changes by searching for 'jonas'
 */

(function (window, $, undefined) {
    var defaultOpts = {

        // Callbacks
        beforeShow: noop,
        move: noop,
        change: noop,
        show: noop,
        hide: noop,

        // Options
        color: false,
        flat: false,
        showInput: false,
        showButtons: true,
        clickoutFiresChange: false,
        showInitial: false,
        showPalette: false,
        showPaletteOnly: false,
        showSelectionPalette: true,
        localStorageKey: false,
        appendTo: "body",
        maxSelectionSize: 7,
        cancelText: "cancel",
        chooseText: "Okay",
        preferredFormat: false,
        className: "",
        showAlpha: false,
        theme: "sp-light",
        palette: ['fff', '000'],
        selectionPalette: [],
        disabled: false
    },
    spectrums = [],
    IE = !!/msie/i.exec( window.navigator.userAgent ),
    rgbaSupport = (function() {
        function contains( str, substr ) {
            return !!~('' + str).indexOf(substr);
        }

        var elem = document.createElement('div');
        var style = elem.style;
        style.cssText = 'background-color:rgba(0,0,0,.5)';
        return contains(style.backgroundColor, 'rgba') || contains(style.backgroundColor, 'hsla');
    })(),
    replaceInput = [
        "<div class='sp-replacer'>",
            "<div class='sp-preview'><div class='sp-preview-inner'></div></div>",
            "<div class='sp-dd'>&#9660;</div>",
        "</div>"
    ].join(''),
    markup = (function () {

        // IE does not support gradients with multiple stops, so we need to simulate
        //  that for the rainbow slider with 8 divs that each have a single gradient
        var gradientFix = "";
        if (IE) {
            for (var i = 1; i <= 6; i++) {
                gradientFix += "<div class='sp-" + i + "'></div>";
            }
        }

        return [
            "<div class='sp-container sp-hidden'>",
                "<div class='sp-palette-container'>",
                    "<div class='sp-palette sp-thumb sp-cf'></div>",
                "</div>",
                "<div class='sp-picker-container'>",
                    "<div class='sp-top sp-cf'>",
                        "<div class='sp-fill'></div>",
                        "<div class='sp-top-inner'>",
                            "<div class='sp-color'>",
                                "<div class='sp-sat'>",
                                    "<div class='sp-val'>",
                                        "<div class='sp-dragger'>",
                                        	"<div class='sp-dragger-inner'></div>",
                                        "</div>",
                                    "</div>",
                                "</div>",
                            "</div>",
                            "<div class='sp-hue'>",
                                "<div class='sp-slider'></div>",
                                gradientFix,
                            "</div>",
                        "</div>",
                        "<div class='sp-alpha'><div class='sp-alpha-inner'><div class='sp-alpha-handle'></div></div></div>",
                    "</div>",
                    "<div class='sp-input-container sp-cf'>",
                        "<input class='sp-input' type='text' spellcheck='false'  />",
                    "</div>",
                    "<div class='sp-initial sp-thumb sp-cf'></div>",
                    "<div class='sp-button-container sp-cf'>",
                        "<a class='sp-cancel' href='#'></a>",
                        "<button class='sp-choose'></button>",
                    "</div>",
                "</div>",
            "</div>"
        ].join("");
    })();

    function paletteTemplate (p, color, className) {
        var html = [];
        for (var i = 0; i < p.length; i++) {
            var tiny = tinycolor(p[i]);
            var c = tiny.toHsl().l < 0.5 ? "sp-thumb-el sp-thumb-dark" : "sp-thumb-el sp-thumb-light";
            c += (tinycolor.equals(color, p[i])) ? " sp-thumb-active" : "";

            var swatchStyle = rgbaSupport ? ("background-color:" + tiny.toRgbString()) : "filter:" + tiny.toFilter();
            html.push('<span title="' + tiny.toRgbString() + '" data-color="' + tiny.toRgbString() + '" class="' + c + '"><span class="sp-thumb-inner" style="' + swatchStyle + ';" /></span>');
        }
        return "<div class='sp-cf " + className + "'>" + html.join('') + "</div>";
    }

    function hideAll() {
        for (var i = 0; i < spectrums.length; i++) {
            if (spectrums[i]) {
                spectrums[i].hide();
            }
        }
    }

    function instanceOptions(o, callbackContext) {
        var opts = $.extend({}, defaultOpts, o);
        opts.callbacks = {
            'move': bind(opts.move, callbackContext),
            'change': bind(opts.change, callbackContext),
            'show': bind(opts.show, callbackContext),
            'hide': bind(opts.hide, callbackContext),
            'beforeShow': bind(opts.beforeShow, callbackContext)
        };

        return opts;
    }

    function spectrum(element, o) {

        var opts = instanceOptions(o, element),
            flat = opts.flat,
            showSelectionPalette = opts.showSelectionPalette,
            localStorageKey = opts.localStorageKey,
            theme = opts.theme,
            callbacks = opts.callbacks,
            resize = throttle(reflow, 10),
            visible = false,
            dragWidth = 0,
            dragHeight = 0,
            dragHelperHeight = 0,
            slideHeight = 0,
            slideWidth = 0,
            alphaWidth = 0,
            alphaSlideHelperWidth = 0,
            slideHelperHeight = 0,
            currentHue = 0,
            currentSaturation = 0,
            currentValue = 0,
            currentAlpha = 1,
            palette = opts.palette.slice(0),
            paletteArray = $.isArray(palette[0]) ? palette : [palette],
            selectionPalette = opts.selectionPalette.slice(0),
            maxSelectionSize = opts.maxSelectionSize,
            draggingClass = "sp-dragging";

        var doc = element.ownerDocument,
            body = doc.body,
            boundElement = $(element),
            disabled = false,
            container = $(markup, doc).addClass(theme),
            dragger = container.find(".sp-color"),
            dragHelper = container.find(".sp-dragger"),
            slider = container.find(".sp-hue"),
            slideHelper = container.find(".sp-slider"),
            alphaSliderInner = container.find(".sp-alpha-inner"),
            alphaSlider = container.find(".sp-alpha"),
            alphaSlideHelper = container.find(".sp-alpha-handle"),
            textInput = container.find(".sp-input"),
            paletteContainer = container.find(".sp-palette"),
            initialColorContainer = container.find(".sp-initial"),
            cancelButton = container.find(".sp-cancel"),
            chooseButton = container.find(".sp-choose"),
            isInput = boundElement.is("input"),
            shouldReplace = isInput && !flat,
            replacer = (shouldReplace) ? $(replaceInput).addClass(theme) : $([]),
            offsetElement = (shouldReplace) ? replacer : boundElement,
            previewElement = replacer.find(".sp-preview-inner"),
            initialColor = opts.color || (isInput && boundElement.val()),
            colorOnShow = false,
            preferredFormat = opts.preferredFormat,
            currentPreferredFormat = preferredFormat,
            clickoutFiresChange = !opts.showButtons || opts.clickoutFiresChange;


        function applyOptions() {

            container.toggleClass("sp-flat", flat);
            container.toggleClass("sp-input-disabled", !opts.showInput);
            container.toggleClass("sp-alpha-enabled", opts.showAlpha);
            container.toggleClass("sp-buttons-disabled", !opts.showButtons || flat);
            container.toggleClass("sp-palette-disabled", !opts.showPalette);
            container.toggleClass("sp-palette-only", opts.showPaletteOnly);
            container.toggleClass("sp-initial-disabled", !opts.showInitial);
            container.addClass(opts.className);

            reflow();
        }

        function initialize() {

            if (IE) {
                container.find("*:not(input)").attr("unselectable", "on");
            }

            applyOptions();

            if (shouldReplace) {
                boundElement.after(replacer).hide();
            }

            if (flat) {
                boundElement.after(container).hide();
            }
            else {

                var appendTo = $(opts.appendTo);
                if (appendTo.length !== 1) {
                    appendTo = $("body");
                }

                appendTo.append(container);
            }

            if (localStorageKey && window.localStorage) {

                // Migrate old palettes over to new format.  May want to remove this eventually.
                try {
                    var oldPalette = window.localStorage[localStorageKey].split(",#");
                    if (oldPalette.length > 1) {
                        delete window.localStorage[localStorageKey];
                        $.each(oldPalette, function(i, c) {
                             addColorToSelectionPalette(c);
                        });
                    }
                }
                catch(e) { }

                try {
                    selectionPalette = window.localStorage[localStorageKey].split(";");
                }
                catch (e) { }
            }

            offsetElement.bind("click.spectrum touchstart.spectrum", function (e) {
                if (!disabled) {
                    toggle();
                }

                e.stopPropagation();

                if (!$(e.target).is("input")) {
                    e.preventDefault();
                }
            });

            if(boundElement.is(":disabled") || (opts.disabled === true)) {
                disable();
            }

            // Prevent clicks from bubbling up to document.  This would cause it to be hidden.
            container.click(stopPropagation);

            // Handle user typed input
            textInput.change(setFromTextInput);
            textInput.bind("paste", function () {
                setTimeout(setFromTextInput, 1);
            });
            textInput.keydown(function (e) { if (e.keyCode == 13) { setFromTextInput(); } });

            cancelButton.text(opts.cancelText);
            cancelButton.bind("click.spectrum", function (e) {
                e.stopPropagation();
                e.preventDefault();
                hide("cancel");
            });

            chooseButton.text(opts.chooseText);
            chooseButton.bind("click.spectrum", function (e) {
                e.stopPropagation();
                e.preventDefault();

                if (isValid()) {
                    updateOriginalInput(true);
                    hide();
                }
            });

            draggable(alphaSlider, function (dragX, dragY, e) {
                currentAlpha = (dragX / alphaWidth);
                if (e.shiftKey) {
                    currentAlpha = Math.round(currentAlpha * 10) / 10;
                }

                move();
            });

            draggable(slider, function (dragX, dragY) {
		// CAM changed this:
		// if they click hue, and it won't do anything, move to
		// full sat/brightness
		if (currentSaturation == 0 || currentValue == 0) {
			currentSaturation = 1;
			currentValue = 1;
		}
                currentHue = parseFloat(dragY / slideHeight);
                move();
            }, dragStart, dragStop);

            draggable(dragger, function (dragX, dragY) {
                currentSaturation = parseFloat(dragX / dragWidth);
                currentValue = parseFloat((dragHeight - dragY) / dragHeight);
                move();
            }, dragStart, dragStop);

            if (!!initialColor) {
                set(initialColor);

                // In case color was black - update the preview UI and set the format
                // since the set function will not run (default color is black).
                updateUI();
                currentPreferredFormat = preferredFormat || tinycolor(initialColor).format;

                addColorToSelectionPalette(initialColor);
            }
            else {
                updateUI();
            }

            if (flat) {
                show();
            }

            function palletElementClick(e) {
                if (e.data && e.data.ignore) {
                    set($(this).data("color"));
                    move();
                }
                else {
                    set($(this).data("color"));
                    updateOriginalInput(true);
                    move();
                    hide();
                }

                return false;
            }

            var paletteEvent = IE ? "mousedown.spectrum" : "click.spectrum touchstart.spectrum";
            paletteContainer.delegate(".sp-thumb-el", paletteEvent, palletElementClick);
            initialColorContainer.delegate(".sp-thumb-el:nth-child(1)", paletteEvent, { ignore: true }, palletElementClick);
        }

        function addColorToSelectionPalette(color) {
            if (showSelectionPalette) {
                var colorRgb = tinycolor(color).toRgbString();
                if ($.inArray(colorRgb, selectionPalette) === -1) {
                    selectionPalette.push(colorRgb);
                    while(selectionPalette.length > maxSelectionSize) {
                        selectionPalette.shift();
                    }
                }

                if (localStorageKey && window.localStorage) {
                    try {
                        window.localStorage[localStorageKey] = selectionPalette.join(";");
                    }
                    catch(e) { }
                }
            }
        }

        function getUniqueSelectionPalette() {
            var unique = [];
            var p = selectionPalette;
            var paletteLookup = {};
            var rgb;

            if (opts.showPalette) {

                for (var i = 0; i < paletteArray.length; i++) {
                    for (var j = 0; j < paletteArray[i].length; j++) {
                        rgb = tinycolor(paletteArray[i][j]).toRgbString();
                        paletteLookup[rgb] = true;
                    }
                }

                for (i = 0; i < p.length; i++) {
                    rgb = tinycolor(p[i]).toRgbString();

                    if (!paletteLookup.hasOwnProperty(rgb)) {
                        unique.push(p[i]);
                        paletteLookup[rgb] = true;
                    }
                }
            }

            return unique.reverse().slice(0, opts.maxSelectionSize);
        }

        function drawPalette() {

            var currentColor = get();

            var html = $.map(paletteArray, function (palette, i) {
                return paletteTemplate(palette, currentColor, "sp-palette-row sp-palette-row-" + i);
            });

            if (selectionPalette) {
                html.push(paletteTemplate(getUniqueSelectionPalette(), currentColor, "sp-palette-row sp-palette-row-selection"));
            }

            paletteContainer.html(html.join(""));
        }

        function drawInitial() {
            if (opts.showInitial) {
                var initial = colorOnShow;
                var current = get();
                initialColorContainer.html(paletteTemplate([initial, current], current, "sp-palette-row-initial"));
            }
        }

        function dragStart() {
            if (dragHeight === 0 || dragWidth === 0 || slideHeight === 0) {
                reflow();
            }
            container.addClass(draggingClass);
        }

        function dragStop() {
            container.removeClass(draggingClass);
        }

        function setFromTextInput() {
            var tiny = tinycolor(textInput.val());
            if (tiny.ok) {
                set(tiny);
            }
            else {
                textInput.addClass("sp-validation-error");
            }
        }

        function toggle() {
            if (visible) {
                hide();
            }
            else {
                show();
            }
        }

        function show() {
            var event = $.Event('beforeShow.spectrum');

            if (visible) {
                reflow();
                return;
            }

            boundElement.trigger(event, [ get() ]);

            if (callbacks.beforeShow(get()) === false || event.isDefaultPrevented()) {
                return;
            }

            hideAll();
            visible = true;

            $(doc).bind("click.spectrum", hide);
	    // cam/jonas: need to bind for touch devices
            $(doc).bind("touchstart.spectrum", maybeHide);
            $(window).bind("resize.spectrum", resize);
            replacer.addClass("sp-active");
            container.removeClass("sp-hidden");

            if (opts.showPalette) {
                drawPalette();
            }
            reflow();
            updateUI();

            colorOnShow = get();

            drawInitial();
            callbacks.show(colorOnShow);
            boundElement.trigger('show.spectrum', [ colorOnShow ]);
        }

	//cam/jonas add: deal with touch
        function maybeHide(e) {
		if (!$(e.target).parents().addBack().is(".sp-picker-container"))
			hide(e);
	}

        function hide(e) {

            // Return on right click
            if (e && e.type == "click" && e.button == 2) { return; }

            // Return if hiding is unnecessary
            if (!visible || flat) { return; }
            visible = false;

	// cam/jonas: need to unbind for touch devices
            $(doc).unbind("click.spectrum touchstart.spectrum", hide);
            $(window).unbind("resize.spectrum", resize);

            replacer.removeClass("sp-active");
            container.addClass("sp-hidden");

            var colorHasChanged = !tinycolor.equals(get(), colorOnShow);

            if (colorHasChanged) {
                if (clickoutFiresChange && e !== "cancel") {
                    updateOriginalInput(true);
                }
                else {
                    revert();
                }
            }

            callbacks.hide(get());
            boundElement.trigger('hide.spectrum', [ get() ]);
        }

        function revert() {
            set(colorOnShow, true);
            //jonas added for ft-logoMaker, 4 April 2013
            callbacks.change(get());
        }

        function set(color, ignoreFormatChange) {
            if (tinycolor.equals(color, get())) {
                return;
            }

            var newColor = tinycolor(color);
            var newHsv = newColor.toHsv();

            currentHue = newHsv.h;
            currentSaturation = newHsv.s;
            currentValue = newHsv.v;
            currentAlpha = newHsv.a;

            updateUI();

            if (newColor.ok && !ignoreFormatChange) {
                currentPreferredFormat = preferredFormat || newColor.format;
            }
        }

        function get() {
            return tinycolor.fromRatio({ h: currentHue, s: currentSaturation, v: currentValue, a: Math.round(currentAlpha * 100) / 100 });
        }

        function isValid() {
            return !textInput.hasClass("sp-validation-error");
        }

        function move() {
            updateUI();

            callbacks.move(get());
            boundElement.trigger('move.spectrum', [ get() ]);
        }

        function updateUI() {

            textInput.removeClass("sp-validation-error");

            updateHelperLocations();

            // Update dragger background color (gradients take care of saturation and value).
            var flatColor = tinycolor({ h: currentHue, s: "1.0", v: "1.0" });
            dragger.css("background-color", flatColor.toHexString());

            // Get a format that alpha will be included in (hex and names ignore alpha)
            var format = currentPreferredFormat;
            if (currentAlpha < 1) {
                if (format === "hex" || format === "name") {
                    format = "rgb";
                }
            }

            var realColor = get(),
                realHex = realColor.toHexString(),
                realRgb = realColor.toRgbString();


            // Update the replaced elements background color (with actual selected color)
            if (rgbaSupport || realColor.alpha === 1) {
                previewElement.css("background-color", realRgb);
            }
            else {
                previewElement.css("background-color", "transparent");
                previewElement.css("filter", realColor.toFilter());
            }

            if (opts.showAlpha) {
                var rgb = realColor.toRgb();
                rgb.a = 0;
                var realAlpha = tinycolor(rgb).toRgbString();
                var gradient = "linear-gradient(left, " + realAlpha + ", " + realHex + ")";

                if (IE) {
                    alphaSliderInner.css("filter", tinycolor(realAlpha).toFilter({ gradientType: 1 }, realHex));
                }
                else {
                    alphaSliderInner.css("background", "-webkit-" + gradient);
                    alphaSliderInner.css("background", "-moz-" + gradient);
                    alphaSliderInner.css("background", "-ms-" + gradient);
                    alphaSliderInner.css("background", gradient);
                }
            }


            // Update the text entry input as it changes happen
            if (opts.showInput) {
                if (currentAlpha < 1) {
                    if (format === "hex" || format === "name") {
                        format = "rgb";
                    }
                }
                textInput.val(realColor.toString(format));
            }

            if (opts.showPalette) {
                drawPalette();
            }

            drawInitial();
        }

        function updateHelperLocations() {
            var s = currentSaturation;
            var v = currentValue;

            // Where to show the little circle in that displays your current selected color
            var dragX = s * dragWidth;
            var dragY = dragHeight - (v * dragHeight);
            dragX = Math.max(
                -dragHelperHeight,
                Math.min(dragWidth - dragHelperHeight, dragX - dragHelperHeight)
            );
            dragY = Math.max(
                -dragHelperHeight,
                Math.min(dragHeight - dragHelperHeight, dragY - dragHelperHeight)
            );
            dragHelper.css({
                "top": dragY,
                "left": dragX
            });

            var alphaX = currentAlpha * alphaWidth;
            alphaSlideHelper.css({
                "left": alphaX - (alphaSlideHelperWidth / 2)
            });

            // Where to show the bar that displays your current selected hue
            var slideY = (currentHue) * slideHeight;
            slideHelper.css({
                "top": slideY - slideHelperHeight
            });
        }

        function updateOriginalInput(fireCallback) {
            var color = get();

            if (isInput) {
                boundElement.val(color.toString(currentPreferredFormat)).change();
            }

            var hasChanged = !tinycolor.equals(color, colorOnShow);
            colorOnShow = color;

            // Update the selection palette with the current color
            addColorToSelectionPalette(color);
            if (fireCallback && hasChanged) {
                callbacks.change(color);
                boundElement.trigger('change.spectrum', [ color ]);
            }
        }

        function reflow() {
            dragWidth = dragger.width();
            dragHeight = dragger.height();
            dragHelperHeight = dragHelper.height();
            slideWidth = slider.width();
            slideHeight = slider.height();
            slideHelperHeight = slideHelper.height();
            alphaWidth = alphaSlider.width();
            alphaSlideHelperWidth = alphaSlideHelper.width();

            if (!flat) {
                container.css("position", "absolute");
                container.offset(getOffset(container, offsetElement));
            }

            updateHelperLocations();
        }

        function destroy() {
            boundElement.show();
            offsetElement.unbind("click.spectrum touchstart.spectrum");
            container.remove();
            replacer.remove();
            spectrums[spect.id] = null;
        }

        function option(optionName, optionValue) {
            if (optionName === undefined) {
                return $.extend({}, opts);
            }
            if (optionValue === undefined) {
                return opts[optionName];
            }

            opts[optionName] = optionValue;
            applyOptions();
        }

        function enable() {
            disabled = false;
            boundElement.attr("disabled", false);
            offsetElement.removeClass("sp-disabled");
        }

        function disable() {
            hide();
            disabled = true;
            boundElement.attr("disabled", true);
            offsetElement.addClass("sp-disabled");
        }

        initialize();

        var spect = {
            show: show,
            hide: hide,
            toggle: toggle,
            reflow: reflow,
            option: option,
            enable: enable,
            disable: disable,
            set: function (c) {
                set(c);
                updateOriginalInput();
            },
            get: get,
            destroy: destroy,
            container: container
        };

        spect.id = spectrums.push(spect) - 1;

        return spect;
    }

    /**
    * checkOffset - get the offset below/above and left/right element depending on screen position
    * Thanks https://github.com/jquery/jquery-ui/blob/master/ui/jquery.ui.datepicker.js
    */
    function getOffset(picker, input) {
        var extraY = 0;
        var dpWidth = picker.outerWidth();
        var dpHeight = picker.outerHeight();
        var inputHeight = input.outerHeight();
        var doc = picker[0].ownerDocument;
        var docElem = doc.documentElement;
        var viewWidth = docElem.clientWidth + $(doc).scrollLeft();
        var viewHeight = docElem.clientHeight + $(doc).scrollTop();
        var offset = input.offset();
        offset.top += inputHeight;

		//jonas changed so that offset is not used (i.e. 0) when viewWidt >= dpWidth (was vW > dpW).
	    offset.left -=
            Math.min(offset.left, (offset.left + dpWidth > viewWidth && viewWidth >= dpWidth) ?
            Math.abs(offset.left + dpWidth - viewWidth) : 0);
            
        offset.top -=
            Math.min(offset.top, ((offset.top + dpHeight > viewHeight && viewHeight >= dpHeight) ?
            Math.abs(dpHeight + inputHeight - extraY) : extraY));

        return offset;
    }

    /**
    * noop - do nothing
    */
    function noop() {

    }

    /**
    * stopPropagation - makes the code only doing this a little easier to read in line
    */
    function stopPropagation(e) {
        e.stopPropagation();
    }

    /**
    * Create a function bound to a given object
    * Thanks to underscore.js
    */
    function bind(func, obj) {
        var slice = Array.prototype.slice;
        var args = slice.call(arguments, 2);
        return function () {
            return func.apply(obj, args.concat(slice.call(arguments)));
        };
    }

    /**
    * Lightweight drag helper.  Handles containment within the element, so that
    * when dragging, the x is within [0,element.width] and y is within [0,element.height]
    */
    function draggable(element, onmove, onstart, onstop) {
        onmove = onmove || function () { };
        onstart = onstart || function () { };
        onstop = onstop || function () { };
        var doc = element.ownerDocument || document;
        var dragging = false;
        var offset = {};
        var maxHeight = 0;
        var maxWidth = 0;
        var hasTouch = ('ontouchstart' in window);

        var duringDragEvents = {};
        duringDragEvents["selectstart"] = prevent;
        duringDragEvents["dragstart"] = prevent;
        duringDragEvents[(hasTouch ? "touchmove" : "mousemove")] = move;
        duringDragEvents[(hasTouch ? "touchend" : "mouseup")] = stop;
        // need to know when they fix this
		var brokenPageCoords = /(Opera Mobi)/i.test(navigator.userAgent);
				
        function prevent(e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.returnValue = false;
        }

        function move(e) {
            if (dragging) {
                // Mouseup happened outside of window
                if (IE && document.documentMode < 9 && !e.button) {
                    return stop();
                }

                var touches = e.originalEvent.touches;
                var pageX = touches ? (brokenPageCoords? touches[0].clientX : touches[0].pageX) : e.pageX;
                var pageY = touches ? (brokenPageCoords? touches[0].clientY : touches[0].pageY) : e.pageY;
                
                var dragX = Math.max(0, Math.min(pageX - offset.left, maxWidth));
                var dragY = Math.max(0, Math.min(pageY - offset.top, maxHeight));

                if (hasTouch) {
                    // Stop scrolling in iOS
                    prevent(e);
                }

                onmove.apply(element, [dragX, dragY, e]);
            }
        }
        function start(e) {
            var rightclick = (e.which) ? (e.which == 3) : (e.button == 2);
            var touches = e.originalEvent.touches;

            if (!rightclick && !dragging) {
                if (onstart.apply(element, arguments) !== false) {
                    dragging = true;
                    maxHeight = $(element).height();
                    maxWidth = $(element).width();
                    offset = $(element).offset();

                    $(doc).bind(duringDragEvents);
                    $(doc.body).addClass("sp-dragging");

		    // cam says always move
                    //if (!hasTouch) {
                        move(e);
                    //}

                    prevent(e);
                }
            }
        }
        function stop() {
            if (dragging) {
                $(doc).unbind(duringDragEvents);
                $(doc.body).removeClass("sp-dragging");
                onstop.apply(element, arguments);
            }
            dragging = false;
        }

        $(element).bind(hasTouch ? "touchstart" : "mousedown", start);
    }

    function throttle(func, wait, debounce) {
        var timeout;
        return function () {
            var context = this, args = arguments;
            var throttler = function () {
                timeout = null;
                func.apply(context, args);
            };
            if (debounce) clearTimeout(timeout);
            if (debounce || !timeout) timeout = setTimeout(throttler, wait);
        };
    }


    /**
    * Define a jQuery plugin
    */
    var dataID = "spectrum.id";
    $.fn.spectrum = function (opts, extra) {

        if (typeof opts == "string") {

            var returnValue = this;
            var args = Array.prototype.slice.call( arguments, 1 );

            this.each(function () {
                var spect = spectrums[$(this).data(dataID)];
                if (spect) {

                    var method = spect[opts];
                    if (!method) {
                        throw new Error( "Spectrum: no such method: '" + opts + "'" );
                    }

                    if (opts == "get") {
                        returnValue = spect.get();
                    }
                    else if (opts == "container") {
                        returnValue = spect.container;
                    }
                    else if (opts == "option") {
                        returnValue = spect.option.apply(spect, args);
                    }
                    else if (opts == "destroy") {
                        spect.destroy();
                        $(this).removeData(dataID);
                    }
                    else {
                        method.apply(spect, args);
                    }
                }
            });

            return returnValue;
        }

        // Initializing a new instance of spectrum
        return this.spectrum("destroy").each(function () {
            var spect = spectrum(this, opts);
            $(this).data(dataID, spect.id);
        });
    };

    $.fn.spectrum.load = true;
    $.fn.spectrum.loadOpts = {};
    $.fn.spectrum.draggable = draggable;
    $.fn.spectrum.defaults = defaultOpts;

    $.spectrum = { };
    $.spectrum.localization = { };
    $.spectrum.palettes = { };

    $.fn.spectrum.processNativeColorInputs = function () {
        var colorInput = $("<input type='color' value='!' />")[0];
        var supportsColor = colorInput.type === "color" && colorInput.value != "!";

        if (!supportsColor) {
            $("input[type=color]").spectrum({
                preferredFormat: "hex6"
            });
        }
    };

    // TinyColor.js - <https://github.com/bgrins/TinyColor> - 2011 Brian Grinstead - v0.5

    (function (window) {

        var trimLeft = /^[\s,#]+/,
        trimRight = /\s+$/,
        tinyCounter = 0,
        math = Math,
        mathRound = math.round,
        mathMin = math.min,
        mathMax = math.max,
        mathRandom = math.random,
        parseFloat = window.parseFloat;

        function tinycolor(color, opts) {

            // If input is already a tinycolor, return itself
            if (typeof color == "object" && color.hasOwnProperty("_tc_id")) {
                return color;
            }

            var rgb = inputToRGB(color);
            var r = rgb.r, g = rgb.g, b = rgb.b, a = parseFloat(rgb.a), format = rgb.format;

            return {
                ok: rgb.ok,
                format: format,
                _tc_id: tinyCounter++,
                alpha: a,
                toHsv: function () {
                    var hsv = rgbToHsv(r, g, b);
                    return { h: hsv.h, s: hsv.s, v: hsv.v, a: a };
                },
                toHsvString: function () {
                    var hsv = rgbToHsv(r, g, b);
                    var h = mathRound(hsv.h * 360), s = mathRound(hsv.s * 100), v = mathRound(hsv.v * 100);
                    return (a == 1) ?
                  "hsv(" + h + ", " + s + "%, " + v + "%)" :
                  "hsva(" + h + ", " + s + "%, " + v + "%, " + a + ")";
                },
                toHsl: function () {
                    var hsl = rgbToHsl(r, g, b);
                    return { h: hsl.h, s: hsl.s, l: hsl.l, a: a };
                },
                toHslString: function () {
                    var hsl = rgbToHsl(r, g, b);
                    var h = mathRound(hsl.h * 360), s = mathRound(hsl.s * 100), l = mathRound(hsl.l * 100);
                    return (a == 1) ?
                  "hsl(" + h + ", " + s + "%, " + l + "%)" :
                  "hsla(" + h + ", " + s + "%, " + l + "%, " + a + ")";
                },
                toHex: function () {
                    return rgbToHex(r, g, b);
                },
                toHexString: function (force6Char) {
                    return '#' + rgbToHex(r, g, b, force6Char);
                },
                toRgb: function () {
                    return { r: mathRound(r), g: mathRound(g), b: mathRound(b), a: a };
                },
                toRgbString: function () {
                    return (a == 1) ?
                  "rgb(" + mathRound(r) + ", " + mathRound(g) + ", " + mathRound(b) + ")" :
                  "rgba(" + mathRound(r) + ", " + mathRound(g) + ", " + mathRound(b) + ", " + a + ")";
                },
                toName: function () {
                    return hexNames[rgbToHex(r, g, b)] || false;
                },
                toFilter: function (opts, secondColor) {

                    var hex = rgbToHex(r, g, b, true);
                    var secondHex = hex;
                    var alphaHex = Math.round(parseFloat(a) * 255).toString(16);
                    var secondAlphaHex = alphaHex;
                    var gradientType = opts && opts.gradientType ? "GradientType = 1, " : "";

                    if (secondColor) {
                        var s = tinycolor(secondColor);
                        secondHex = s.toHex();
                        secondAlphaHex = Math.round(parseFloat(s.alpha) * 255).toString(16);
                    }

                    return "progid:DXImageTransform.Microsoft.gradient("+gradientType+"startColorstr=#" + pad2(alphaHex) + hex + ",endColorstr=#" + pad2(secondAlphaHex) + secondHex + ")";
                },
                toString: function (format) {
                    format = format || this.format;
                    var formattedString = false;
                    if (format === "rgb") {
                        formattedString = this.toRgbString();
                    }
                    if (format === "hex") {
                        formattedString = this.toHexString();
                    }
                    if (format === "hex6") {
                        formattedString = this.toHexString(true);
                    }
                    if (format === "name") {
                        formattedString = this.toName();
                    }
                    if (format === "hsl") {
                        formattedString = this.toHslString();
                    }
                    if (format === "hsv") {
                        formattedString = this.toHsvString();
                    }

                    return formattedString || this.toHexString(true);
                }
            };
        }

        // If input is an object, force 1 into "1.0" to handle ratios properly
        // String input requires "1.0" as input, so 1 will be treated as 1
        tinycolor.fromRatio = function (color) {

            if (typeof color == "object") {
                for (var i in color) {
                    if (color[i] === 1) {
                        color[i] = "1.0";
                    }
                }
            }

            return tinycolor(color);

        };

        // Given a string or object, convert that input to RGB
        // Possible string inputs:
        //
        //     "red"
        //     "#f00" or "f00"
        //     "#ff0000" or "ff0000"
        //     "rgb 255 0 0" or "rgb (255, 0, 0)"
        //     "rgb 1.0 0 0" or "rgb (1, 0, 0)"
        //     "rgba (255, 0, 0, 1)" or "rgba 255, 0, 0, 1"
        //     "rgba (1.0, 0, 0, 1)" or "rgba 1.0, 0, 0, 1"
        //     "hsl(0, 100%, 50%)" or "hsl 0 100% 50%"
        //     "hsla(0, 100%, 50%, 1)" or "hsla 0 100% 50%, 1"
        //     "hsv(0, 100%, 100%)" or "hsv 0 100% 100%"
        //
        function inputToRGB(color) {

            var rgb = { r: 0, g: 0, b: 0 };
            var a = 1;
            var ok = false;
            var format = false;

            if (typeof color == "string") {
                color = stringInputToObject(color);
            }

            if (typeof color == "object") {
                if (color.hasOwnProperty("r") && color.hasOwnProperty("g") && color.hasOwnProperty("b")) {
                    rgb = rgbToRgb(color.r, color.g, color.b);
                    ok = true;
                    format = "rgb";
                }
                else if (color.hasOwnProperty("h") && color.hasOwnProperty("s") && color.hasOwnProperty("v")) {
                    rgb = hsvToRgb(color.h, color.s, color.v);
                    ok = true;
                    format = "hsv";
                }
                else if (color.hasOwnProperty("h") && color.hasOwnProperty("s") && color.hasOwnProperty("l")) {
                    rgb = hslToRgb(color.h, color.s, color.l);
                    ok = true;
                    format = "hsl";
                }

                if (color.hasOwnProperty("a")) {
                    a = color.a;
                }
            }

            rgb.r = mathMin(255, mathMax(rgb.r, 0));
            rgb.g = mathMin(255, mathMax(rgb.g, 0));
            rgb.b = mathMin(255, mathMax(rgb.b, 0));


            // Don't let the range of [0,255] come back in [0,1].
            // Potentially lose a little bit of precision here, but will fix issues where
            // .5 gets interpreted as half of the total, instead of half of 1.
            // If it was supposed to be 128, this was already taken care of in the conversion function
            if (rgb.r < 1) { rgb.r = mathRound(rgb.r); }
            if (rgb.g < 1) { rgb.g = mathRound(rgb.g); }
            if (rgb.b < 1) { rgb.b = mathRound(rgb.b); }

            return {
                ok: ok,
                format: (color && color.format) || format,
                r: rgb.r,
                g: rgb.g,
                b: rgb.b,
                a: a
            };
        }



        // Conversion Functions
        // --------------------

        // `rgbToHsl`, `rgbToHsv`, `hslToRgb`, `hsvToRgb` modified from:
        // <http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript>

        // `rgbToRgb`
        // Handle bounds / percentage checking to conform to CSS color spec
        // <http://www.w3.org/TR/css3-color/>
        // *Assumes:* r, g, b in [0, 255] or [0, 1]
        // *Returns:* { r, g, b } in [0, 255]
        function rgbToRgb(r, g, b) {
            return {
                r: bound01(r, 255) * 255,
                g: bound01(g, 255) * 255,
                b: bound01(b, 255) * 255
            };
        }

        // `rgbToHsl`
        // Converts an RGB color value to HSL.
        // *Assumes:* r, g, and b are contained in [0, 255] or [0, 1]
        // *Returns:* { h, s, l } in [0,1]
        function rgbToHsl(r, g, b) {

            r = bound01(r, 255);
            g = bound01(g, 255);
            b = bound01(b, 255);

            var max = mathMax(r, g, b), min = mathMin(r, g, b);
            var h, s, l = (max + min) / 2;

            if (max == min) {
                h = s = 0; // achromatic
            }
            else {
                var d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }

                h /= 6;
            }

            return { h: h, s: s, l: l };
        }

        // `hslToRgb`
        // Converts an HSL color value to RGB.
        // *Assumes:* h is contained in [0, 1] or [0, 360] and s and l are contained [0, 1] or [0, 100]
        // *Returns:* { r, g, b } in the set [0, 255]
        function hslToRgb(h, s, l) {
            var r, g, b;

            h = bound01(h, 360);
            s = bound01(s, 100);
            l = bound01(l, 100);

            function hue2rgb(p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            }

            if (s === 0) {
                r = g = b = l; // achromatic
            }
            else {
                var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                var p = 2 * l - q;
                r = hue2rgb(p, q, h + 1 / 3);
                g = hue2rgb(p, q, h);
                b = hue2rgb(p, q, h - 1 / 3);
            }

            return { r: r * 255, g: g * 255, b: b * 255 };
        }

        // `rgbToHsv`
        // Converts an RGB color value to HSV
        // *Assumes:* r, g, and b are contained in the set [0, 255] or [0, 1]
        // *Returns:* { h, s, v } in [0,1]
        function rgbToHsv(r, g, b) {

            r = bound01(r, 255);
            g = bound01(g, 255);
            b = bound01(b, 255);

            var max = mathMax(r, g, b), min = mathMin(r, g, b);
            var h, s, v = max;

            var d = max - min;
            s = max === 0 ? 0 : d / max;

            if (max == min) {
                h = 0; // achromatic
            }
            else {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return { h: h, s: s, v: v };
        }

        // `hsvToRgb`
        // Converts an HSV color value to RGB.
        // *Assumes:* h is contained in [0, 1] or [0, 360] and s and v are contained in [0, 1] or [0, 100]
        // *Returns:* { r, g, b } in the set [0, 255]
        function hsvToRgb(h, s, v) {
            h = bound01(h, 360) * 6;
            s = bound01(s, 100);
            v = bound01(v, 100);

            var i = math.floor(h),
                f = h - i,
                p = v * (1 - s),
                q = v * (1 - f * s),
                t = v * (1 - (1 - f) * s),
                mod = i % 6,
                r = [v, q, p, p, t, v][mod],
                g = [t, v, v, q, p, p][mod],
                b = [p, p, t, v, v, q][mod];

            return { r: r * 255, g: g * 255, b: b * 255 };
        }

        // `rgbToHex`
        // Converts an RGB color to hex
        // Assumes r, g, and b are contained in the set [0, 255]
        // Returns a 3 or 6 character hex
        function rgbToHex(r, g, b, force6Char) {

            var hex = [
                pad2(mathRound(r).toString(16)),
                pad2(mathRound(g).toString(16)),
                pad2(mathRound(b).toString(16))
            ];

            // Return a 3 character hex if possible
            if (!force6Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1)) {
                return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0);
            }

            return hex.join("");
        }

        // `equals`
        // Can be called with any tinycolor input
        tinycolor.equals = function (color1, color2) {
            if (!color1 || !color2) { return false; }
            return tinycolor(color1).toRgbString() == tinycolor(color2).toRgbString();
        };
        tinycolor.random = function () {
            return tinycolor.fromRatio({
                r: mathRandom(),
                g: mathRandom(),
                b: mathRandom()
            });
        };


        // Modification Functions
        // ----------------------
        // Thanks to less.js for some of the basics here
        // <https://github.com/cloudhead/less.js/blob/master/lib/less/functions.js>


        tinycolor.desaturate = function (color, amount) {
            var hsl = tinycolor(color).toHsl();
            hsl.s -= ((amount || 10) / 100);
            hsl.s = clamp01(hsl.s);
            return tinycolor(hsl);
        };
        tinycolor.saturate = function (color, amount) {
            var hsl = tinycolor(color).toHsl();
            hsl.s += ((amount || 10) / 100);
            hsl.s = clamp01(hsl.s);
            return tinycolor(hsl);
        };
        tinycolor.greyscale = function (color) {
            return tinycolor.desaturate(color, 100);
        };
        tinycolor.lighten = function (color, amount) {
            var hsl = tinycolor(color).toHsl();
            hsl.l += ((amount || 10) / 100);
            hsl.l = clamp01(hsl.l);
            return tinycolor(hsl);
        };
        tinycolor.darken = function (color, amount) {
            var hsl = tinycolor(color).toHsl();
            hsl.l -= ((amount || 10) / 100);
            hsl.l = clamp01(hsl.l);
            return tinycolor(hsl);
        };
        tinycolor.complement = function (color) {
            var hsl = tinycolor(color).toHsl();
            hsl.h = (hsl.h + 0.5) % 1;
            return tinycolor(hsl);
        };


        // Combination Functions
        // ---------------------
        // Thanks to jQuery xColor for some of the ideas behind these
        // <https://github.com/infusion/jQuery-xcolor/blob/master/jquery.xcolor.js>

        tinycolor.triad = function (color) {
            var hsl = tinycolor(color).toHsl();
            var h = hsl.h * 360;
            return [
            tinycolor(color),
            tinycolor({ h: (h + 120) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 240) % 360, s: hsl.s, l: hsl.l })
        ];
        };
        tinycolor.tetrad = function (color) {
            var hsl = tinycolor(color).toHsl();
            var h = hsl.h * 360;
            return [
            tinycolor(color),
            tinycolor({ h: (h + 90) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 180) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 270) % 360, s: hsl.s, l: hsl.l })
        ];
        };
        tinycolor.splitcomplement = function (color) {
            var hsl = tinycolor(color).toHsl();
            var h = hsl.h * 360;
            return [
            tinycolor(color),
            tinycolor({ h: (h + 72) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 216) % 360, s: hsl.s, l: hsl.l })
        ];
        };
        tinycolor.analogous = function (color, results, slices) {
            results = results || 6;
            slices = slices || 30;

            var hsl = tinycolor(color).toHsl();
            var part = 360 / slices;
            var ret = [tinycolor(color)];

            hsl.h *= 360;

            for (hsl.h = ((hsl.h - (part * results >> 1)) + 720) % 360; --results; ) {
                hsl.h = (hsl.h + part) % 360;
                ret.push(tinycolor(hsl));
            }
            return ret;
        };
        tinycolor.monochromatic = function (color, results) {
            results = results || 6;
            var hsv = tinycolor(color).toHsv();
            var h = hsv.h, s = hsv.s, v = hsv.v;
            var ret = [];
            var modification = 1 / results;

            while (results--) {
                ret.push(tinycolor({ h: h, s: s, v: v }));
                v = (v + modification) % 1;
            }

            return ret;
        };
        tinycolor.readable = function (color1, color2) {
            var a = tinycolor(color1).toRgb(), b = tinycolor(color2).toRgb();
            return (
            (b.r - a.r) * (b.r - a.r) +
            (b.g - a.g) * (b.g - a.g) +
            (b.b - a.b) * (b.b - a.b)
        ) > 0x28A4;
        };

        // Big List of Colors
        // ---------
        // <http://www.w3.org/TR/css3-color/#svg-color>
        var names = tinycolor.names = {
            aliceblue: "f0f8ff",
            antiquewhite: "faebd7",
            aqua: "0ff",
            aquamarine: "7fffd4",
            azure: "f0ffff",
            beige: "f5f5dc",
            bisque: "ffe4c4",
            black: "000",
            blanchedalmond: "ffebcd",
            blue: "00f",
            blueviolet: "8a2be2",
            brown: "a52a2a",
            burlywood: "deb887",
            burntsienna: "ea7e5d",
            cadetblue: "5f9ea0",
            chartreuse: "7fff00",
            chocolate: "d2691e",
            coral: "ff7f50",
            cornflowerblue: "6495ed",
            cornsilk: "fff8dc",
            crimson: "dc143c",
            cyan: "0ff",
            darkblue: "00008b",
            darkcyan: "008b8b",
            darkgoldenrod: "b8860b",
            darkgray: "a9a9a9",
            darkgreen: "006400",
            darkgrey: "a9a9a9",
            darkkhaki: "bdb76b",
            darkmagenta: "8b008b",
            darkolivegreen: "556b2f",
            darkorange: "ff8c00",
            darkorchid: "9932cc",
            darkred: "8b0000",
            darksalmon: "e9967a",
            darkseagreen: "8fbc8f",
            darkslateblue: "483d8b",
            darkslategray: "2f4f4f",
            darkslategrey: "2f4f4f",
            darkturquoise: "00ced1",
            darkviolet: "9400d3",
            deeppink: "ff1493",
            deepskyblue: "00bfff",
            dimgray: "696969",
            dimgrey: "696969",
            dodgerblue: "1e90ff",
            firebrick: "b22222",
            floralwhite: "fffaf0",
            forestgreen: "228b22",
            fuchsia: "f0f",
            gainsboro: "dcdcdc",
            ghostwhite: "f8f8ff",
            gold: "ffd700",
            goldenrod: "daa520",
            gray: "808080",
            green: "008000",
            greenyellow: "adff2f",
            grey: "808080",
            honeydew: "f0fff0",
            hotpink: "ff69b4",
            indianred: "cd5c5c",
            indigo: "4b0082",
            ivory: "fffff0",
            khaki: "f0e68c",
            lavender: "e6e6fa",
            lavenderblush: "fff0f5",
            lawngreen: "7cfc00",
            lemonchiffon: "fffacd",
            lightblue: "add8e6",
            lightcoral: "f08080",
            lightcyan: "e0ffff",
            lightgoldenrodyellow: "fafad2",
            lightgray: "d3d3d3",
            lightgreen: "90ee90",
            lightgrey: "d3d3d3",
            lightpink: "ffb6c1",
            lightsalmon: "ffa07a",
            lightseagreen: "20b2aa",
            lightskyblue: "87cefa",
            lightslategray: "789",
            lightslategrey: "789",
            lightsteelblue: "b0c4de",
            lightyellow: "ffffe0",
            lime: "0f0",
            limegreen: "32cd32",
            linen: "faf0e6",
            magenta: "f0f",
            maroon: "800000",
            mediumaquamarine: "66cdaa",
            mediumblue: "0000cd",
            mediumorchid: "ba55d3",
            mediumpurple: "9370db",
            mediumseagreen: "3cb371",
            mediumslateblue: "7b68ee",
            mediumspringgreen: "00fa9a",
            mediumturquoise: "48d1cc",
            mediumvioletred: "c71585",
            midnightblue: "191970",
            mintcream: "f5fffa",
            mistyrose: "ffe4e1",
            moccasin: "ffe4b5",
            navajowhite: "ffdead",
            navy: "000080",
            oldlace: "fdf5e6",
            olive: "808000",
            olivedrab: "6b8e23",
            orange: "ffa500",
            orangered: "ff4500",
            orchid: "da70d6",
            palegoldenrod: "eee8aa",
            palegreen: "98fb98",
            paleturquoise: "afeeee",
            palevioletred: "db7093",
            papayawhip: "ffefd5",
            peachpuff: "ffdab9",
            peru: "cd853f",
            pink: "ffc0cb",
            plum: "dda0dd",
            powderblue: "b0e0e6",
            purple: "800080",
            red: "f00",
            rosybrown: "bc8f8f",
            royalblue: "4169e1",
            saddlebrown: "8b4513",
            salmon: "fa8072",
            sandybrown: "f4a460",
            seagreen: "2e8b57",
            seashell: "fff5ee",
            sienna: "a0522d",
            silver: "c0c0c0",
            skyblue: "87ceeb",
            slateblue: "6a5acd",
            slategray: "708090",
            slategrey: "708090",
            snow: "fffafa",
            springgreen: "00ff7f",
            steelblue: "4682b4",
            tan: "d2b48c",
            teal: "008080",
            thistle: "d8bfd8",
            tomato: "ff6347",
            turquoise: "40e0d0",
            violet: "ee82ee",
            wheat: "f5deb3",
            white: "fff",
            whitesmoke: "f5f5f5",
            yellow: "ff0",
            yellowgreen: "9acd32"
        };

        // Make it easy to access colors via `hexNames[hex]`
        var hexNames = tinycolor.hexNames = flip(names);


        // Utilities
        // ---------

        // `{ 'name1': 'val1' }` becomes `{ 'val1': 'name1' }`
        function flip(o) {
            var flipped = {};
            for (var i in o) {
                if (o.hasOwnProperty(i)) {
                    flipped[o[i]] = i;
                }
            }
            return flipped;
        }

        // Take input from [0, n] and return it as [0, 1]
        function bound01(n, max) {
            if (isOnePointZero(n)) { n = "100%"; }

            var processPercent = isPercentage(n);
            n = mathMin(max, mathMax(0, parseFloat(n)));

            // Automatically convert percentage into number
            if (processPercent) {
                n = n * (max / 100);
            }

            // Handle floating point rounding errors
            if (math.abs(n - max) < 0.000001) {
                return 1;
            }
            else if (n >= 1) {
                return (n % max) / parseFloat(max);
            }
            return n;
        }

        // Force a number between 0 and 1
        function clamp01(val) {
            return mathMin(1, mathMax(0, val));
        }

        // Parse an integer into hex
        function parseHex(val) {
            return parseInt(val, 16);
        }

        // Need to handle 1.0 as 100%, since once it is a number, there is no difference between it and 1
        // <http://stackoverflow.com/questions/7422072/javascript-how-to-detect-number-as-a-decimal-including-1-0>
        function isOnePointZero(n) {
            return typeof n == "string" && n.indexOf('.') != -1 && parseFloat(n) === 1;
        }

        // Check to see if string passed in is a percentage
        function isPercentage(n) {
            return typeof n === "string" && n.indexOf('%') != -1;
        }

        // Force a hex value to have 2 characters
        function pad2(c) {
            return c.length == 1 ? '0' + c : '' + c;
        }

        var matchers = (function () {

            // <http://www.w3.org/TR/css3-values/#integers>
            var CSS_INTEGER = "[-\\+]?\\d+%?";

            // <http://www.w3.org/TR/css3-values/#number-value>
            var CSS_NUMBER = "[-\\+]?\\d*\\.\\d+%?";

            // Allow positive/negative integer/number.  Don't capture the either/or, just the entire outcome.
            var CSS_UNIT = "(?:" + CSS_NUMBER + ")|(?:" + CSS_INTEGER + ")";

            // Actual matching.
            // Parentheses and commas are optional, but not required.
            // Whitespace can take the place of commas or opening paren
            var PERMISSIVE_MATCH3 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
            var PERMISSIVE_MATCH4 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";

            return {
                rgb: new RegExp("rgb" + PERMISSIVE_MATCH3),
                rgba: new RegExp("rgba" + PERMISSIVE_MATCH4),
                hsl: new RegExp("hsl" + PERMISSIVE_MATCH3),
                hsla: new RegExp("hsla" + PERMISSIVE_MATCH4),
                hsv: new RegExp("hsv" + PERMISSIVE_MATCH3),
                hex3: /^([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
                hex6: /^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
            };
        })();

        // `stringInputToObject`
        // Permissive string parsing.  Take in a number of formats, and output an object
        // based on detected format.  Returns `{ r, g, b }` or `{ h, s, l }` or `{ h, s, v}`
        function stringInputToObject(color) {

            color = color.replace(trimLeft, '').replace(trimRight, '').toLowerCase();
            var named = false;
            if (names[color]) {
                color = names[color];
                named = true;
            }
            else if (color == 'transparent') {
                return { r: 0, g: 0, b: 0, a: 0 };
            }

            // Try to match string input using regular expressions.
            // Keep most of the number bounding out of this function - don't worry about [0,1] or [0,100] or [0,360]
            // Just return an object and let the conversion functions handle that.
            // This way the result will be the same whether the tinycolor is initialized with string or object.
            var match;
            if ((match = matchers.rgb.exec(color))) {
                return { r: match[1], g: match[2], b: match[3] };
            }
            if ((match = matchers.rgba.exec(color))) {
                return { r: match[1], g: match[2], b: match[3], a: match[4] };
            }
            if ((match = matchers.hsl.exec(color))) {
                return { h: match[1], s: match[2], l: match[3] };
            }
            if ((match = matchers.hsla.exec(color))) {
                return { h: match[1], s: match[2], l: match[3], a: match[4] };
            }
            if ((match = matchers.hsv.exec(color))) {
                return { h: match[1], s: match[2], v: match[3] };
            }
            if ((match = matchers.hex6.exec(color))) {
                return {
                    r: parseHex(match[1]),
                    g: parseHex(match[2]),
                    b: parseHex(match[3]),
                    format: named ? "name" : "hex"
                };
            }
            if ((match = matchers.hex3.exec(color))) {
                return {
                    r: parseHex(match[1] + '' + match[1]),
                    g: parseHex(match[2] + '' + match[2]),
                    b: parseHex(match[3] + '' + match[3]),
                    format: named ? "name" : "hex"
                };
            }

            return false;
        }

        // Everything is ready, expose to window
        window.tinycolor = tinycolor;

    })(this);

    $(function () {
        if ($.fn.spectrum.load) {
            $.fn.spectrum.processNativeColorInputs();
        }
    });


    function log(){window.console&&(log=Function.prototype.bind?Function.prototype.bind.call(console.log,console):function(){Function.prototype.apply.call(console.log,console,arguments)},log.apply(this,arguments))};


})(window, jQuery);

/**
 * easyXDM
 * http://easyxdm.net/
 * Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function(N,d,p,K,k,H){var b=this;var n=Math.floor(Math.random()*10000);var q=Function.prototype;var Q=/^((http.?:)\/\/([^:\/\s]+)(:\d+)*)/;var R=/[\-\w]+\/\.\.\//;var F=/([^:])\/\//g;var I="";var o={};var M=N.easyXDM;var U="easyXDM_";var E;var y=false;var i;var h;function C(X,Z){var Y=typeof X[Z];return Y=="function"||(!!(Y=="object"&&X[Z]))||Y=="unknown"}function u(X,Y){return !!(typeof(X[Y])=="object"&&X[Y])}function r(X){return Object.prototype.toString.call(X)==="[object Array]"}function c(){try{var X=new ActiveXObject("ShockwaveFlash.ShockwaveFlash");i=Array.prototype.slice.call(X.GetVariable("$version").match(/(\d+),(\d+),(\d+),(\d+)/),1);h=parseInt(i[0],10)>9&&parseInt(i[1],10)>0;X=null;return true}catch(Y){return false}}var v,x;if(C(N,"addEventListener")){v=function(Z,X,Y){Z.addEventListener(X,Y,false)};x=function(Z,X,Y){Z.removeEventListener(X,Y,false)}}else{if(C(N,"attachEvent")){v=function(X,Z,Y){X.attachEvent("on"+Z,Y)};x=function(X,Z,Y){X.detachEvent("on"+Z,Y)}}else{throw new Error("Browser not supported")}}var W=false,J=[],L;if("readyState" in d){L=d.readyState;W=L=="complete"||(~navigator.userAgent.indexOf("AppleWebKit/")&&(L=="loaded"||L=="interactive"))}else{W=!!d.body}function s(){if(W){return}W=true;for(var X=0;X<J.length;X++){J[X]()}J.length=0}if(!W){if(C(N,"addEventListener")){v(d,"DOMContentLoaded",s)}else{v(d,"readystatechange",function(){if(d.readyState=="complete"){s()}});if(d.documentElement.doScroll&&N===top){var g=function(){if(W){return}try{d.documentElement.doScroll("left")}catch(X){K(g,1);return}s()};g()}}v(N,"load",s)}function G(Y,X){if(W){Y.call(X);return}J.push(function(){Y.call(X)})}function m(){var Z=parent;if(I!==""){for(var X=0,Y=I.split(".");X<Y.length;X++){Z=Z[Y[X]]}}return Z.easyXDM}function e(X){N.easyXDM=M;I=X;if(I){U="easyXDM_"+I.replace(".","_")+"_"}return o}function z(X){return X.match(Q)[3]}function f(X){return X.match(Q)[4]||""}function j(Z){var X=Z.toLowerCase().match(Q);var aa=X[2],ab=X[3],Y=X[4]||"";if((aa=="http:"&&Y==":80")||(aa=="https:"&&Y==":443")){Y=""}return aa+"//"+ab+Y}function B(X){X=X.replace(F,"$1/");if(!X.match(/^(http||https):\/\//)){var Y=(X.substring(0,1)==="/")?"":p.pathname;if(Y.substring(Y.length-1)!=="/"){Y=Y.substring(0,Y.lastIndexOf("/")+1)}X=p.protocol+"//"+p.host+Y+X}while(R.test(X)){X=X.replace(R,"")}return X}function P(X,aa){var ac="",Z=X.indexOf("#");if(Z!==-1){ac=X.substring(Z);X=X.substring(0,Z)}var ab=[];for(var Y in aa){if(aa.hasOwnProperty(Y)){ab.push(Y+"="+H(aa[Y]))}}return X+(y?"#":(X.indexOf("?")==-1?"?":"&"))+ab.join("&")+ac}var S=(function(X){X=X.substring(1).split("&");var Z={},aa,Y=X.length;while(Y--){aa=X[Y].split("=");Z[aa[0]]=k(aa[1])}return Z}(/xdm_e=/.test(p.search)?p.search:p.hash));function t(X){return typeof X==="undefined"}var O=function(){var Y={};var Z={a:[1,2,3]},X='{"a":[1,2,3]}';if(typeof JSON!="undefined"&&typeof JSON.stringify==="function"&&JSON.stringify(Z).replace((/\s/g),"")===X){return JSON}if(Object.toJSON){if(Object.toJSON(Z).replace((/\s/g),"")===X){Y.stringify=Object.toJSON}}if(typeof String.prototype.evalJSON==="function"){Z=X.evalJSON();if(Z.a&&Z.a.length===3&&Z.a[2]===3){Y.parse=function(aa){return aa.evalJSON()}}}if(Y.stringify&&Y.parse){O=function(){return Y};return Y}return null};function T(X,Y,Z){var ab;for(var aa in Y){if(Y.hasOwnProperty(aa)){if(aa in X){ab=Y[aa];if(typeof ab==="object"){T(X[aa],ab,Z)}else{if(!Z){X[aa]=Y[aa]}}}else{X[aa]=Y[aa]}}}return X}function a(){var Y=d.body.appendChild(d.createElement("form")),X=Y.appendChild(d.createElement("input"));X.name=U+"TEST"+n;E=X!==Y.elements[X.name];d.body.removeChild(Y)}function A(X){if(t(E)){a()}var Z;if(E){Z=d.createElement('<iframe name="'+X.props.name+'"/>')}else{Z=d.createElement("IFRAME");Z.name=X.props.name}Z.id=Z.name=X.props.name;delete X.props.name;if(X.onLoad){v(Z,"load",X.onLoad)}if(typeof X.container=="string"){X.container=d.getElementById(X.container)}if(!X.container){T(Z.style,{position:"absolute",top:"-2000px"});X.container=d.body}var Y=X.props.src;delete X.props.src;T(Z,X.props);Z.border=Z.frameBorder=0;Z.allowTransparency=true;X.container.appendChild(Z);Z.src=Y;X.props.src=Y;return Z}function V(aa,Z){if(typeof aa=="string"){aa=[aa]}var Y,X=aa.length;while(X--){Y=aa[X];Y=new RegExp(Y.substr(0,1)=="^"?Y:("^"+Y.replace(/(\*)/g,".$1").replace(/\?/g,".")+"$"));if(Y.test(Z)){return true}}return false}function l(Z){var ae=Z.protocol,Y;Z.isHost=Z.isHost||t(S.xdm_p);y=Z.hash||false;if(!Z.props){Z.props={}}if(!Z.isHost){Z.channel=S.xdm_c;Z.secret=S.xdm_s;Z.remote=S.xdm_e;ae=S.xdm_p;if(Z.acl&&!V(Z.acl,Z.remote)){throw new Error("Access denied for "+Z.remote)}}else{Z.remote=B(Z.remote);Z.channel=Z.channel||"default"+n++;Z.secret=Math.random().toString(16).substring(2);if(t(ae)){if(j(p.href)==j(Z.remote)){ae="4"}else{if(C(N,"postMessage")||C(d,"postMessage")){ae="1"}else{if(Z.swf&&C(N,"ActiveXObject")&&c()){ae="6"}else{if(navigator.product==="Gecko"&&"frameElement" in N&&navigator.userAgent.indexOf("WebKit")==-1){ae="5"}else{if(Z.remoteHelper){Z.remoteHelper=B(Z.remoteHelper);ae="2"}else{ae="0"}}}}}}}Z.protocol=ae;switch(ae){case"0":T(Z,{interval:100,delay:2000,useResize:true,useParent:false,usePolling:false},true);if(Z.isHost){if(!Z.local){var ac=p.protocol+"//"+p.host,X=d.body.getElementsByTagName("img"),ad;var aa=X.length;while(aa--){ad=X[aa];if(ad.src.substring(0,ac.length)===ac){Z.local=ad.src;break}}if(!Z.local){Z.local=N}}var ab={xdm_c:Z.channel,xdm_p:0};if(Z.local===N){Z.usePolling=true;Z.useParent=true;Z.local=p.protocol+"//"+p.host+p.pathname+p.search;ab.xdm_e=Z.local;ab.xdm_pa=1}else{ab.xdm_e=B(Z.local)}if(Z.container){Z.useResize=false;ab.xdm_po=1}Z.remote=P(Z.remote,ab)}else{T(Z,{channel:S.xdm_c,remote:S.xdm_e,useParent:!t(S.xdm_pa),usePolling:!t(S.xdm_po),useResize:Z.useParent?false:Z.useResize})}Y=[new o.stack.HashTransport(Z),new o.stack.ReliableBehavior({}),new o.stack.QueueBehavior({encode:true,maxLength:4000-Z.remote.length}),new o.stack.VerifyBehavior({initiate:Z.isHost})];break;case"1":Y=[new o.stack.PostMessageTransport(Z)];break;case"2":Y=[new o.stack.NameTransport(Z),new o.stack.QueueBehavior(),new o.stack.VerifyBehavior({initiate:Z.isHost})];break;case"3":Y=[new o.stack.NixTransport(Z)];break;case"4":Y=[new o.stack.SameOriginTransport(Z)];break;case"5":Y=[new o.stack.FrameElementTransport(Z)];break;case"6":if(!i){c()}Y=[new o.stack.FlashTransport(Z)];break}Y.push(new o.stack.QueueBehavior({lazy:Z.lazy,remove:true}));return Y}function D(aa){var ab,Z={incoming:function(ad,ac){this.up.incoming(ad,ac)},outgoing:function(ac,ad){this.down.outgoing(ac,ad)},callback:function(ac){this.up.callback(ac)},init:function(){this.down.init()},destroy:function(){this.down.destroy()}};for(var Y=0,X=aa.length;Y<X;Y++){ab=aa[Y];T(ab,Z,true);if(Y!==0){ab.down=aa[Y-1]}if(Y!==X-1){ab.up=aa[Y+1]}}return ab}function w(X){X.up.down=X.down;X.down.up=X.up;X.up=X.down=null}T(o,{version:"2.4.15.118",query:S,stack:{},apply:T,getJSONObject:O,whenReady:G,noConflict:e});o.DomHelper={on:v,un:x,requiresJSON:function(X){if(!u(N,"JSON")){d.write('<script type="text/javascript" src="'+X+'"><\/script>')}}};(function(){var X={};o.Fn={set:function(Y,Z){X[Y]=Z},get:function(Z,Y){var aa=X[Z];if(Y){delete X[Z]}return aa}}}());o.Socket=function(Y){var X=D(l(Y).concat([{incoming:function(ab,aa){Y.onMessage(ab,aa)},callback:function(aa){if(Y.onReady){Y.onReady(aa)}}}])),Z=j(Y.remote);this.origin=j(Y.remote);this.destroy=function(){X.destroy()};this.postMessage=function(aa){X.outgoing(aa,Z)};X.init()};o.Rpc=function(Z,Y){if(Y.local){for(var ab in Y.local){if(Y.local.hasOwnProperty(ab)){var aa=Y.local[ab];if(typeof aa==="function"){Y.local[ab]={method:aa}}}}}var X=D(l(Z).concat([new o.stack.RpcBehavior(this,Y),{callback:function(ac){if(Z.onReady){Z.onReady(ac)}}}]));this.origin=j(Z.remote);this.destroy=function(){X.destroy()};X.init()};o.stack.SameOriginTransport=function(Y){var Z,ab,aa,X;return(Z={outgoing:function(ad,ae,ac){aa(ad);if(ac){ac()}},destroy:function(){if(ab){ab.parentNode.removeChild(ab);ab=null}},onDOMReady:function(){X=j(Y.remote);if(Y.isHost){T(Y.props,{src:P(Y.remote,{xdm_e:p.protocol+"//"+p.host+p.pathname,xdm_c:Y.channel,xdm_p:4}),name:U+Y.channel+"_provider"});ab=A(Y);o.Fn.set(Y.channel,function(ac){aa=ac;K(function(){Z.up.callback(true)},0);return function(ad){Z.up.incoming(ad,X)}})}else{aa=m().Fn.get(Y.channel,true)(function(ac){Z.up.incoming(ac,X)});K(function(){Z.up.callback(true)},0)}},init:function(){G(Z.onDOMReady,Z)}})};o.stack.FlashTransport=function(aa){var ac,X,ab,ad,Y,ae;function af(ah,ag){K(function(){ac.up.incoming(ah,ad)},0)}function Z(ah){var ag=aa.swf+"?host="+aa.isHost;var aj="easyXDM_swf_"+Math.floor(Math.random()*10000);o.Fn.set("flash_loaded"+ah.replace(/[\-.]/g,"_"),function(){o.stack.FlashTransport[ah].swf=Y=ae.firstChild;var ak=o.stack.FlashTransport[ah].queue;for(var al=0;al<ak.length;al++){ak[al]()}ak.length=0});if(aa.swfContainer){ae=(typeof aa.swfContainer=="string")?d.getElementById(aa.swfContainer):aa.swfContainer}else{ae=d.createElement("div");T(ae.style,h&&aa.swfNoThrottle?{height:"20px",width:"20px",position:"fixed",right:0,top:0}:{height:"1px",width:"1px",position:"absolute",overflow:"hidden",right:0,top:0});d.body.appendChild(ae)}var ai="callback=flash_loaded"+ah.replace(/[\-.]/g,"_")+"&proto="+b.location.protocol+"&domain="+z(b.location.href)+"&port="+f(b.location.href)+"&ns="+I;ae.innerHTML="<object height='20' width='20' type='application/x-shockwave-flash' id='"+aj+"' data='"+ag+"'><param name='allowScriptAccess' value='always'></param><param name='wmode' value='transparent'><param name='movie' value='"+ag+"'></param><param name='flashvars' value='"+ai+"'></param><embed type='application/x-shockwave-flash' FlashVars='"+ai+"' allowScriptAccess='always' wmode='transparent' src='"+ag+"' height='1' width='1'></embed></object>"}return(ac={outgoing:function(ah,ai,ag){Y.postMessage(aa.channel,ah.toString());if(ag){ag()}},destroy:function(){try{Y.destroyChannel(aa.channel)}catch(ag){}Y=null;if(X){X.parentNode.removeChild(X);X=null}},onDOMReady:function(){ad=aa.remote;o.Fn.set("flash_"+aa.channel+"_init",function(){K(function(){ac.up.callback(true)})});o.Fn.set("flash_"+aa.channel+"_onMessage",af);aa.swf=B(aa.swf);var ah=z(aa.swf);var ag=function(){o.stack.FlashTransport[ah].init=true;Y=o.stack.FlashTransport[ah].swf;Y.createChannel(aa.channel,aa.secret,j(aa.remote),aa.isHost);if(aa.isHost){if(h&&aa.swfNoThrottle){T(aa.props,{position:"fixed",right:0,top:0,height:"20px",width:"20px"})}T(aa.props,{src:P(aa.remote,{xdm_e:j(p.href),xdm_c:aa.channel,xdm_p:6,xdm_s:aa.secret}),name:U+aa.channel+"_provider"});X=A(aa)}};if(o.stack.FlashTransport[ah]&&o.stack.FlashTransport[ah].init){ag()}else{if(!o.stack.FlashTransport[ah]){o.stack.FlashTransport[ah]={queue:[ag]};Z(ah)}else{o.stack.FlashTransport[ah].queue.push(ag)}}},init:function(){G(ac.onDOMReady,ac)}})};o.stack.PostMessageTransport=function(aa){var ac,ad,Y,Z;function X(ae){if(ae.origin){return j(ae.origin)}if(ae.uri){return j(ae.uri)}if(ae.domain){return p.protocol+"//"+ae.domain}throw"Unable to retrieve the origin of the event"}function ab(af){var ae=X(af);if(ae==Z&&af.data.substring(0,aa.channel.length+1)==aa.channel+" "){ac.up.incoming(af.data.substring(aa.channel.length+1),ae)}}return(ac={outgoing:function(af,ag,ae){Y.postMessage(aa.channel+" "+af,ag||Z);if(ae){ae()}},destroy:function(){x(N,"message",ab);if(ad){Y=null;ad.parentNode.removeChild(ad);ad=null}},onDOMReady:function(){Z=j(aa.remote);if(aa.isHost){var ae=function(af){if(af.data==aa.channel+"-ready"){Y=("postMessage" in ad.contentWindow)?ad.contentWindow:ad.contentWindow.document;x(N,"message",ae);v(N,"message",ab);K(function(){ac.up.callback(true)},0)}};v(N,"message",ae);T(aa.props,{src:P(aa.remote,{xdm_e:j(p.href),xdm_c:aa.channel,xdm_p:1}),name:U+aa.channel+"_provider"});ad=A(aa)}else{v(N,"message",ab);Y=("postMessage" in N.parent)?N.parent:N.parent.document;Y.postMessage(aa.channel+"-ready",Z);K(function(){ac.up.callback(true)},0)}},init:function(){G(ac.onDOMReady,ac)}})};o.stack.FrameElementTransport=function(Y){var Z,ab,aa,X;return(Z={outgoing:function(ad,ae,ac){aa.call(this,ad);if(ac){ac()}},destroy:function(){if(ab){ab.parentNode.removeChild(ab);ab=null}},onDOMReady:function(){X=j(Y.remote);if(Y.isHost){T(Y.props,{src:P(Y.remote,{xdm_e:j(p.href),xdm_c:Y.channel,xdm_p:5}),name:U+Y.channel+"_provider"});ab=A(Y);ab.fn=function(ac){delete ab.fn;aa=ac;K(function(){Z.up.callback(true)},0);return function(ad){Z.up.incoming(ad,X)}}}else{if(d.referrer&&j(d.referrer)!=S.xdm_e){N.top.location=S.xdm_e}aa=N.frameElement.fn(function(ac){Z.up.incoming(ac,X)});Z.up.callback(true)}},init:function(){G(Z.onDOMReady,Z)}})};o.stack.NameTransport=function(ab){var ac;var ae,ai,aa,ag,ah,Y,X;function af(al){var ak=ab.remoteHelper+(ae?"#_3":"#_2")+ab.channel;ai.contentWindow.sendMessage(al,ak)}function ad(){if(ae){if(++ag===2||!ae){ac.up.callback(true)}}else{af("ready");ac.up.callback(true)}}function aj(ak){ac.up.incoming(ak,Y)}function Z(){if(ah){K(function(){ah(true)},0)}}return(ac={outgoing:function(al,am,ak){ah=ak;af(al)},destroy:function(){ai.parentNode.removeChild(ai);ai=null;if(ae){aa.parentNode.removeChild(aa);aa=null}},onDOMReady:function(){ae=ab.isHost;ag=0;Y=j(ab.remote);ab.local=B(ab.local);if(ae){o.Fn.set(ab.channel,function(al){if(ae&&al==="ready"){o.Fn.set(ab.channel,aj);ad()}});X=P(ab.remote,{xdm_e:ab.local,xdm_c:ab.channel,xdm_p:2});T(ab.props,{src:X+"#"+ab.channel,name:U+ab.channel+"_provider"});aa=A(ab)}else{ab.remoteHelper=ab.remote;o.Fn.set(ab.channel,aj)}ai=A({props:{src:ab.local+"#_4"+ab.channel},onLoad:function ak(){var al=ai||this;x(al,"load",ak);o.Fn.set(ab.channel+"_load",Z);(function am(){if(typeof al.contentWindow.sendMessage=="function"){ad()}else{K(am,50)}}())}})},init:function(){G(ac.onDOMReady,ac)}})};o.stack.HashTransport=function(Z){var ac;var ah=this,af,aa,X,ad,am,ab,al;var ag,Y;function ak(ao){if(!al){return}var an=Z.remote+"#"+(am++)+"_"+ao;((af||!ag)?al.contentWindow:al).location=an}function ae(an){ad=an;ac.up.incoming(ad.substring(ad.indexOf("_")+1),Y)}function aj(){if(!ab){return}var an=ab.location.href,ap="",ao=an.indexOf("#");if(ao!=-1){ap=an.substring(ao)}if(ap&&ap!=ad){ae(ap)}}function ai(){aa=setInterval(aj,X)}return(ac={outgoing:function(an,ao){ak(an)},destroy:function(){N.clearInterval(aa);if(af||!ag){al.parentNode.removeChild(al)}al=null},onDOMReady:function(){af=Z.isHost;X=Z.interval;ad="#"+Z.channel;am=0;ag=Z.useParent;Y=j(Z.remote);if(af){Z.props={src:Z.remote,name:U+Z.channel+"_provider"};if(ag){Z.onLoad=function(){ab=N;ai();ac.up.callback(true)}}else{var ap=0,an=Z.delay/50;(function ao(){if(++ap>an){throw new Error("Unable to reference listenerwindow")}try{ab=al.contentWindow.frames[U+Z.channel+"_consumer"]}catch(aq){}if(ab){ai();ac.up.callback(true)}else{K(ao,50)}}())}al=A(Z)}else{ab=N;ai();if(ag){al=parent;ac.up.callback(true)}else{T(Z,{props:{src:Z.remote+"#"+Z.channel+new Date(),name:U+Z.channel+"_consumer"},onLoad:function(){ac.up.callback(true)}});al=A(Z)}}},init:function(){G(ac.onDOMReady,ac)}})};o.stack.ReliableBehavior=function(Y){var aa,ac;var ab=0,X=0,Z="";return(aa={incoming:function(af,ad){var ae=af.indexOf("_"),ag=af.substring(0,ae).split(",");af=af.substring(ae+1);if(ag[0]==ab){Z="";if(ac){ac(true)}}if(af.length>0){aa.down.outgoing(ag[1]+","+ab+"_"+Z,ad);if(X!=ag[1]){X=ag[1];aa.up.incoming(af,ad)}}},outgoing:function(af,ad,ae){Z=af;ac=ae;aa.down.outgoing(X+","+(++ab)+"_"+af,ad)}})};o.stack.QueueBehavior=function(Z){var ac,ad=[],ag=true,aa="",af,X=0,Y=false,ab=false;function ae(){if(Z.remove&&ad.length===0){w(ac);return}if(ag||ad.length===0||af){return}ag=true;var ah=ad.shift();ac.down.outgoing(ah.data,ah.origin,function(ai){ag=false;if(ah.callback){K(function(){ah.callback(ai)},0)}ae()})}return(ac={init:function(){if(t(Z)){Z={}}if(Z.maxLength){X=Z.maxLength;ab=true}if(Z.lazy){Y=true}else{ac.down.init()}},callback:function(ai){ag=false;var ah=ac.up;ae();ah.callback(ai)},incoming:function(ak,ai){if(ab){var aj=ak.indexOf("_"),ah=parseInt(ak.substring(0,aj),10);aa+=ak.substring(aj+1);if(ah===0){if(Z.encode){aa=k(aa)}ac.up.incoming(aa,ai);aa=""}}else{ac.up.incoming(ak,ai)}},outgoing:function(al,ai,ak){if(Z.encode){al=H(al)}var ah=[],aj;if(ab){while(al.length!==0){aj=al.substring(0,X);al=al.substring(aj.length);ah.push(aj)}while((aj=ah.shift())){ad.push({data:ah.length+"_"+aj,origin:ai,callback:ah.length===0?ak:null})}}else{ad.push({data:al,origin:ai,callback:ak})}if(Y){ac.down.init()}else{ae()}},destroy:function(){af=true;ac.down.destroy()}})};o.stack.VerifyBehavior=function(ab){var ac,aa,Y,Z=false;function X(){aa=Math.random().toString(16).substring(2);ac.down.outgoing(aa)}return(ac={incoming:function(af,ad){var ae=af.indexOf("_");if(ae===-1){if(af===aa){ac.up.callback(true)}else{if(!Y){Y=af;if(!ab.initiate){X()}ac.down.outgoing(af)}}}else{if(af.substring(0,ae)===Y){ac.up.incoming(af.substring(ae+1),ad)}}},outgoing:function(af,ad,ae){ac.down.outgoing(aa+"_"+af,ad,ae)},callback:function(ad){if(ab.initiate){X()}}})};o.stack.RpcBehavior=function(ad,Y){var aa,af=Y.serializer||O();var ae=0,ac={};function X(ag){ag.jsonrpc="2.0";aa.down.outgoing(af.stringify(ag))}function ab(ag,ai){var ah=Array.prototype.slice;return function(){var aj=arguments.length,al,ak={method:ai};if(aj>0&&typeof arguments[aj-1]==="function"){if(aj>1&&typeof arguments[aj-2]==="function"){al={success:arguments[aj-2],error:arguments[aj-1]};ak.params=ah.call(arguments,0,aj-2)}else{al={success:arguments[aj-1]};ak.params=ah.call(arguments,0,aj-1)}ac[""+(++ae)]=al;ak.id=ae}else{ak.params=ah.call(arguments,0)}if(ag.namedParams&&ak.params.length===1){ak.params=ak.params[0]}X(ak)}}function Z(an,am,ai,al){if(!ai){if(am){X({id:am,error:{code:-32601,message:"Procedure not found."}})}return}var ak,ah;if(am){ak=function(ao){ak=q;X({id:am,result:ao})};ah=function(ao,ap){ah=q;var aq={id:am,error:{code:-32099,message:ao}};if(ap){aq.error.data=ap}X(aq)}}else{ak=ah=q}if(!r(al)){al=[al]}try{var ag=ai.method.apply(ai.scope,al.concat([ak,ah]));if(!t(ag)){ak(ag)}}catch(aj){ah(aj.message)}}return(aa={incoming:function(ah,ag){var ai=af.parse(ah);if(ai.method){if(Y.handle){Y.handle(ai,X)}else{Z(ai.method,ai.id,Y.local[ai.method],ai.params)}}else{var aj=ac[ai.id];if(ai.error){if(aj.error){aj.error(ai.error)}}else{if(aj.success){aj.success(ai.result)}}delete ac[ai.id]}},init:function(){if(Y.remote){for(var ag in Y.remote){if(Y.remote.hasOwnProperty(ag)){ad[ag]=ab(Y.remote[ag],ag)}}}aa.down.init()},destroy:function(){for(var ag in Y.remote){if(Y.remote.hasOwnProperty(ag)&&ad.hasOwnProperty(ag)){delete ad[ag]}}aa.down.destroy()}})};b.easyXDM=o})(window,document,location,window.setTimeout,decodeURIComponent,encodeURIComponent);/*
    http://www.JSON.org/json2.js
    See http://www.JSON.org/js.html
*/


if (!this.JSON) {
    this.JSON = {};
}

(function () {

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function (key) {

            return isFinite(this.valueOf()) ?
                   this.getUTCFullYear()   + '-' +
                 f(this.getUTCMonth() + 1) + '-' +
                 f(this.getUTCDate())      + 'T' +
                 f(this.getUTCHours())     + ':' +
                 f(this.getUTCMinutes())   + ':' +
                 f(this.getUTCSeconds())   + 'Z' : null;
        };

        String.prototype.toJSON =
        Number.prototype.toJSON =
        Boolean.prototype.toJSON = function (key) {
            return this.valueOf();
        };
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ?
            '"' + string.replace(escapable, function (a) {
                var c = meta[a];
                return typeof c === 'string' ? c :
                    '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0 ? '[]' :
                    gap ? '[\n' + gap +
                            partial.join(',\n' + gap) + '\n' +
                                mind + ']' :
                          '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    k = rep[i];
                    if (typeof k === 'string') {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0 ? '{}' :
                gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' +
                        mind + '}' : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                     typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/.
test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@').
replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function' ?
                    walk({'': j}, '') : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());
var localeInitStrings = [];

var localeStrings = localeStrings || {};

function mergeStrings(data) {
	$.extend(localeStrings,data);
}

function _(str) {
	return localeStrings[str] || str;
}
/*
//dont do this for now.
//simply use val function of hintedInput widget
//reasons if we use myjQuery for all code this will make extra comparison for each val() call
//if we use it only for hintedInput elements then its same as calling $(el).hintedInput("val")

var myjQuery = jQuery.sub();
var orig = jQuery.fn.val;
myjQuery.fn.val = function(newVal) {
	if (typeof newVal == 'undefined' && $(this).data('hintedInput') && !!$(this).hintedInput("isHintOn")) {
		//return empty string instead of hint value
		return "";
	}
	
	//call the original jQuery method
	return orig.apply( this, arguments );
};
*/
(function($){
	//hintedInput
	$.widget("ft.hintedInput", {
		options: {
			hintText:"Type your text here"
			,hintCss:{
				color:"#555"
			}
		}
		,_create: function() {
			if(($(this.element).prop('type')!='text') && (!(this.element).is('textarea'))) {
				return;
			}
			//prepare css to use when hint is not displayed
			this._buildNoHintCss();
			
			$(this.element).bind('focus.hintedInput',{self:this},function(e) {
				e.data.self._hideHint();
			});
			$(this.element).bind('blur.hintedInput',{self:this},function(e) {
				e.data.self._showHint();
			});
			this._showHint();
		}
		,_buildNoHintCss: function(){
			var css = {};
			var el = $(this.element);
			$.each(this.options.hintCss,function(k,v){
				css[k] = el.css(k);
			});
			this.noHintCss = css;
		}
		,_hideHint:function(){
			if(this.hintOn){
				$(this.element).val("").css(this.noHintCss);
				this.hintOn = false;
			}
		}
		,_showHint:function(){
			if($(this.element).val() == ""){
				$(this.element).val(this.options.hintText).css(this.options.hintCss);
				this.hintOn = true;
			}
			else
				this.hintOn = false;
		}
		,isHintOn:function(){
			return this.hintOn;
		}
		,val:function(newVal){
			if(typeof newVal != 'undefined')
				return $(this.element).val(newVal);
			if(this.hintOn)
				return "";
			return $(this.element).val();
		}
		,destroy:function(){
			this.element
				.removeClass('hintedInput')
				.removeData('hintedInput')
				.unbind('.hintedInput');
			$(document).unbind('.hintedInput');
			$.Widget.prototype.destroy.apply(this,arguments);

		}
	});
})(jQuery);
function goSlider(formid,ref,min,max,step,logic,delay) {
$(document).ready(function() {
	setTimeout(function(){
	//console.log("run once:"+formid+":"+ref);
		var $slideInput = $('#'+formid+'-'+ref);
		
		//jonas added to deal with .val() being incorrect for checkboxes on browser back
		var currentVal = function() {
			var val = $slideInput.val();
			if($slideInput.is(":checkbox"))
				val = ($slideInput.is(":checked")) ? "on" : "off";
				
			return val;
		};
		
		//var touch = $("html").hasClass("has-touch");
		//$slideInput.noChange = false;
		
		$('#'+formid+'-'+ref+'Slider').slider({
			slide: function(event,ui) {
					//console.log("slide:"+ui.value+":"+mapFromSlider({val:ui.value,min:min,max:max,logic:logic}));
					//console.log("slide check:"+ui.value+":"+mapToSlider({val:mapFromSlider({val:ui.value,min:min,max:max,logic:logic}),min:min,max:max,logic:logic}));
					//update input, if visible (not for small touch devices)
					//$slideInput.noChange=true;
					$slideInput.val(mapFromSlider({val:ui.value,min:min,max:max,logic:logic}));
					//event.stopPropagation(); // evil
					//$slideInput.noChange=false;
			}
			,min: min
			,max: max
			,step: step
			,start: function(event,ui){
				//console.log("start");
				$slideInput.addClass("sliderActive");
			}
			,stop: function(event,ui){
				//console.log("stop->change");
				$slideInput.removeClass("sliderActive").change();
				//$slideInput.removeClass("sliderActive");
			}
		});
		//console.log("value:"+currentVal()+":"+logic);
		$('#'+formid+'-'+ref+'Slider').slider('option','value'
			,mapToSlider({
				val:currentVal()
				,min:min
				,max:max
				,logic:logic
			})
		);
		$slideInput.change(function(evt) {
			//if ($slideInput.noChange) {
				//console.log("no change");
				//return;
			//}
			//console.log("change:  currnetVal:"+currentVal()+":"+logic);
			$('#'+formid+'-'+ref+'Slider').slider('option','value'
				,mapToSlider({
					val:currentVal()
					,min:min
					,max:max
					,logic:logic
				})
			);
		});
		//console.log("slider input:"+$slideInput.length);
		$slideInput.keyup(function(evt) {
			//if ($slideInput.noChange) {
			//	console.log("no change keyup");
			//	return;
			//}
			//console.log("key up");
			//console.log(evt);
			setTimeout(function() {
				//console.log("key up:  currnetVal:"+currentVal()+":"+logic);
				$('#'+formid+'-'+ref+'Slider').slider('option','value'
					,mapToSlider({
						val:currentVal()
						,min:min
						,max:max
						,logic:logic
					})
				);
			},50);
		});
	},delay);
});
};

var isPremiumTriggered = function(trigger,premiumValue,value) {
	var isTriggered=false;
	switch(trigger) {
		case 'ge':
			isTriggered=(value>=premiumValue);
			break;
		case 'le':
			isTriggered=(value<=premiumValue);
			break;
		case 'gt':
			isTriggered=(value>premiumValue);
			break;
		case 'lt':
			isTriggered=(value<premiumValue);
			break;
		case 'eq':
			isTriggered=(value==premiumValue);
			break;
		case 'ne':
		default:
			isTriggered=(value!=premiumValue);
			break;
	};
	return isTriggered;
};
var isPremiumValSet = function(type,premiumValue){
	switch (type) {
		case 'toggle':
			return (typeof premiumValue === 'boolean');
		case 'adjustment':
		default:
			return (typeof premiumValue === 'number' && premiumValue!=-1);
	}
};

var handlePremium = function(id,defaultValue,type,premiumValue,trigger,imagebot) {
	if($('#'+id).closest('.formEntry').hasClass('hidden'))
		return;
	if (imagebot) {
		if (!trigger || trigger=='null') {
			$('#'+id).closest('.formEntry').remove();
		}
		return;
	};
	var isPremiumValueSet = isPremiumValSet(type,premiumValue);

	var myvalue = isPremiumValueSet ? premiumValue : defaultValue;
	$('#'+id).closest('.formEntry').find('.clear').before('<div class="ftPremiumLabel" title="'+premiumFeatureString+'"><span>'+premiumString+'</span></div>');
	var resetPremium = function() {
		switch (type) {
			case 'toggle':
				$('#'+id).prop("checked", defaultValue).change();
				//need to change state class for on-off-switches
				var stateClass = (defaultValue) ? "on" : "off";
				$('#'+id).siblings(".ft-onoff-switch-wrapper").removeClass("on off").addClass(stateClass);
				break;
			case 'adjustment':
			default:
				$('#'+id).val(defaultValue).change();
		};
	};
	$('#'+id).closest('.formEntry').find('.ftPremiumLabel').on("click", function(){
		resetPremium();
		//special case: make sure tooltip registers as seen, if showing when clicking on premiumLabel
		if ($("html").hasClass('has-localStorage') 
		&& !(localStorage.getItem('ft-dynamic-displayingPremiumTooltip') === "true") //not showing now
		&& !(localStorage.getItem('ft-dynamic-seenPremiumTooltip') === "true") //not shown before
		){
			try {
				localStorage.setItem("ft-dynamic-seenPremiumTooltip",true);
			} catch(error) {
				return false;
			}
		}
	});
	var checkPremium = function() {
		var isPremium = false;
		switch (type) {
			case 'toggle':
				isPremium = isPremiumTriggered(trigger,myvalue,$('#'+id).prop("checked"));
				break;
			case 'adjustment':
			default:
				isPremium = isPremiumTriggered(trigger,myvalue,$('#'+id).val());
		};

		var $ftPremium = $('#'+id).closest('.ftPremium');
		var $ftPremiumLabel = $('#'+id).closest('.formEntry').find('.ftPremiumLabel');

		if (isPremium) {
			$ftPremium.addClass('ftPremiumActive');

			if (isPremiumValueSet && type != 'toggle') {
				$ftPremiumLabel.removeClass('hidden');
				$ftPremium.removeClass('bgDisabled');
			}

			if (!premiumLogin) {
				$('.ft-create-logo-btn').attr('title','Click here to create your premium logo').val(premiumString).html('<span style=\"float:left;\">'+createLogoString+'<span class="ft-btn-premium-label">('+premiumString+')</span></span>').parent(".ft-btn-border-mask").addClass("premiumText");
		
			//===DEV: ONLY TURN ON FOR TESTING SHOWING PREMIUM TIP EVERY TIME!!
			//localStorage.removeItem('ft-dynamic-seenPremiumTooltip');
			//===END DEV

				//show premium tooltip - ONCE (only when localStorage supported)
				if ($("html").hasClass('has-localStorage') 
				&& !(localStorage.getItem('ft-dynamic-displayingPremiumTooltip') === "true") //not showing now
				&& !(localStorage.getItem('ft-dynamic-seenPremiumTooltip') === "true") //not shown before
				){

					try {
						var toolTipMsg = $("<strong>Your logo turned premium</strong>! <br><span>To make your logo <strong>free</strong> again, <br>click the glowing stars.</span> <br><a target='_blank' href='/Store/premium'>Find out more</a>");

						localStorage.setItem("ft-dynamic-displayingPremiumTooltip",true);

						showTooltip(toolTipMsg, $ftPremiumLabel, function(){
							//callback function on hide

							//still displaying? if not - then no longer premium - don't register as seen
							if(localStorage.getItem('ft-dynamic-displayingPremiumTooltip')==="true"){
								localStorage.setItem("ft-dynamic-seenPremiumTooltip",true);
								localStorage.removeItem('ft-dynamic-displayingPremiumTooltip');
							}
						});
					} catch(error) {
						return false;
					}

				}
			}
			
		} else {
			$ftPremium.removeClass('ftPremiumActive');
			if (!$('.ftPremiumActive').length)
				$('.ft-create-logo-btn').attr('title','Click here to create your logo').val(createLogoString).html(createLogoString).parent(".ft-btn-border-mask").removeClass("premiumText");
			if (isPremiumValueSet && type != 'toggle') {
				$ftPremiumLabel.addClass('hidden');
				$ftPremium.addClass('bgDisabled');
			}

			//if premium tooltip is currently showing, hide it
			if (!premiumLogin && $("html").hasClass('has-localStorage') 
			&& localStorage.getItem('ft-dynamic-displayingPremiumTooltip')==="true") {
				localStorage.removeItem('ft-dynamic-displayingPremiumTooltip');

				//hide tooltip via it's own hiding function, triggered on close-btn
				//generic selector works because only one ft-tooltip on screen at the time
				$(".ft-tooltip").first().find(".ft-tooltip-close-btn").click();
			}
		}
	};
	checkPremium();
	switch (type) {
		case 'toggle':
		case 'adjustment':
		default:
			$('#'+id).change(checkPremium);
	}
}

function handleFontPopup(opts) {
	$(document).ready(function(){
		var id = '#'+opts.formId+"-"+opts.formParam;

		//$("<div id='"+opts.formId+"-"+opts.formParam+"-placeholder'></div>").appendTo($('#'+opts.formId+'-frame'+opts.frameNum+'-datapicker_placeholders'));
		$("<div id='"+opts.formId+"-"+opts.formParam+"-placeholder'></div>").insertAfter($(id).parent(".formEntryValue"));
		fnQ.push(function(){
			$(id+'-placeholder').fontpicker({
				ajaxHost: "http://"+opts.httpHost
				,controlElement:$(id).siblings('.fontImage')
				,tags:{
					names:{type:'list',values:fontCategories}
				}
				,origValue:$(id).val()
				,initialTag:$(id+'_tagname').val()
				,init:function(e,ui){
					var val = $(id).val();

					//remove unused input type image
					$(id+'Image').remove();
					//set background-image on controlElement instead
					$(id).siblings('.fontImage').css('background-image', 'url("http://cdn1.ftimg.com/fonts/preview/'+opts.previewDir+'/'+ui.escapeFn(val)+'.png")');
				}
				,select:function(e,ui){
					$(id).val(ui.selected.value).trigger('change');
					$(id+'_tagname').val(ui.selected.tagname)
					//set background-image on controlElement instead
					$(id).siblings('.fontImage').css('background-image', 'url("http://cdn1.ftimg.com/fonts/preview/'+opts.previewDir+'/'+ui.selected.escapedValue+'.png")');
				}
				,cancel:function(e,ui){
					$(id).val(ui.original.value).trigger('change');
					$(id+'_tagname').val(ui.original.tagname)
					//set background-image on controlElement instead
					$(id).siblings('.fontImage').css('background-image', 'url("http://cdn1.ftimg.com/fonts/preview/'+opts.previewDir+'/'+ui.original.escapedValue+'.png")');
				}
				,open:function(e,ui){$(id).closest('.formEntryValue').parent().addClass('datapicker_opened');}
				,close:function(e,ui){$(id).closest('.formEntryValue').parent().removeClass('datapicker_opened');}
				,pixelRatio:opts.pixelRatio
				,mode:"popup" //TODO: perhaps set to inline for mobile? or at least opera mini?
			});
		});
	});
}

function goShadowType() {
//var v1 = '#shadowXOffsetDiv,#shadowYOffsetDiv,#shadowBlurDiv,#colorShadowDiv,#shadowOpacityDiv';
//var v2 = '#reflectOpacityDiv,#reflectTiltXDiv,#reflectPercentDiv,#reflectScaleYPercentDiv,#reflectXOffsetDiv,#reflectYOffsetDiv';
//var v3 = '#colorShadowGlowDiv,#shadowGlowSizeDiv,#shadowGlowFeatherDiv';
//var v4 = '#colorShadowNormalDiv,#shadowNormalFeatherDiv,#shadowNormalOpacityDiv,#shadowNormalTiltXDiv,#shadowNormalScaleYPercentDiv,#shadowNormalXOffsetDiv,#shadowNormalYOffsetDiv';
var v1 = '#shadowXOffsetDiv,#shadowYOffsetDiv,#shadowBlurDiv,#shadowColorDiv,#shadowOpacityDiv';
var v2 = '#reflectOpacityDiv,#reflectTiltXDiv,#reflectPercentDiv,#reflectScaleYPercentDiv,#reflectXOffsetDiv,#reflectYOffsetDiv';
var v3 = '#shadowGlowColorDiv,#shadowGlowSizeDiv,#shadowGlowFeatherDiv';
var v4 = '#shadowNormalColorDiv,#shadowNormalFeatherDiv,#shadowNormalOpacityDiv,#shadowNormalTiltXDiv,#shadowNormalScaleYPercentDiv,#shadowNormalXOffsetDiv,#shadowNormalYOffsetDiv';
function x2(e,v) {if(e) $(v).show();else $(v).hide(); }
function yy(v) {x2(v=='1',v1);x2(v=='2',v2);x2(v=='3',v3);x2(v=='4',v4);}
$('[name="shadowType"]').change(function () {var theVal = $('[name="shadowType"]:checked').val(); yy(theVal);});
$('[name="shadowType"]').keypress(function () {var theVal = $('[name="shadowType"]:checked').val(); yy(theVal);});
var theVal = $('[name="shadowType"]:checked').val(); yy(theVal);
}

var setAutoSize = function(checked){
	//'this' is the input field
	$(this).closest('.box_inner').find('[type="checkbox"][name="useAutoSize"]').prop("checked",checked).change();
};

var imageWidthChanged = function(e){
	setAutoSize.call(this,false);
};
var imageHeightChanged = function(e){
	setAutoSize.call(this,false)
};
var imageAlignmentChanged = function(e){
	setAutoSize.call(this,false);
};



function addNewIndicator(){
	$(document).ready(function(){
		var elems = $(".box_title_link.ft_imageSizeBox") 				//Image Size box
		/*not new anymore		.add($('[id$="backgroundRadioDiv"]').map(function(){		//Starburst
						return $(this).find(".radioWrapper").last().get(0);
					}).get())*/
		;
		elems.append('<img height="12" border="0" alt="New" title="New" src="http://cdn1.ftimg.com/images/carousel/red-new-icon.png" style="margin:0px 0px 0px 3px;">');
	});
};
//run it
addNewIndicator();




function handleFlagPopup(opts) {
	$(document).ready(function(){
		var id = '#'+opts.formId+"-"+opts.formParam;

		var orignalVal = $(id).val();//.substr($(id).val().lastIndexOf("/")+1,2);

		//$("<div id='"+opts.formId+"-"+opts.formParam+"-placeholder'></div>").appendTo($('#'+opts.formId+'-frame'+opts.frameNum+'-datapicker_placeholders'));
		$("<div id='"+opts.formId+"-"+opts.formParam+"-placeholder'></div>").insertAfter($(id).parent(".formEntryValue"));
		fnQ.push(function(){
			$(id+'-placeholder').flagpicker({
				ajaxHost: "http://"+opts.httpHost
				,controlElement:$(id+'Image').parent('.flagWrapper')
				,tags:{
					names:{type:'list',values:[{name:'standard',title:'Standard'}]}
				}
				,origValue:orignalVal
				,initialTag:$(id+'_tagname').val()
				,init:function(e,ui){
					var val = orignalVal;
					$(id+'Image').attr({
						//'src':'http://cdn1.ftimg.com/thumb/s'+opts.previewDir+'/clipart/flags/gen/'+ui.escapeFn(val)+'-small.gif'
						'src':'http://cdn1.ftimg.com/clipart/flags/gen/'+ui.escapeFn(val)+'-small.gif'
						,'alt':val
					});
				}
				,select:function(e,ui){
					$(id).val(ui.selected.escapedValue).trigger('change');
					$(id+'_tagname').val(ui.selected.tagname)
					$(id+'Image').attr({
						//'src':'http://cdn1.ftimg.com/thumb/s'+opts.previewDir+'/clipart/flags/gen/'+ui.selected.escapedValue+'.jpg'
						'src':'http://cdn1.ftimg.com/clipart/flags/gen/'+ui.selected.escapedValue+'-small.gif'
						,'alt':ui.selected.value
					});
				}
				,cancel:function(e,ui){
					$(id).val(ui.original.escapedValue).trigger('change');
					$(id+'_tagname').val(ui.original.tagname)
					$(id+'Image').attr({
						//'src':'http://cdn1.ftimg.com/thumb/s'+opts.previewDir+'/clipart/flags/gen/'+ui.original.escapedValue+'.jpg'
						'src':'http://cdn1.ftimg.com/clipart/flags/gen/'+ui.original.escapedValue+'-small.gif'
						,'alt':ui.original.value
					});
				}
				,open:function(e,ui){$(id).closest('.formEntryValue').parent().addClass('datapicker_opened');}
				,close:function(e,ui){$(id).closest('.formEntryValue').parent().removeClass('datapicker_opened');}
				,pixelRatio:opts.pixelRatio
				,mode:"popup"
			});
		});
	});
}

//track input text selections so we can use it when replacing selected text with symbols picked from the symbolpicker
var textSelections={};
var trackTextSelection = function(e){
	var id = $(this).attr("id");
	textSelections[id] = $(this).getSelection();
	textSelections[id]['originalText'] = $(this).val();
};

function updateTextSelection(textAreaId){
	//hack - we delay so it is executed after select callback of the symbolPicker
	window.setTimeout(function(){
		$('#'+textAreaId).trigger('input');
		var textSelection = textSelections[textAreaId];
		if(textSelection && textSelection.length>0){
			$('#'+textAreaId).setSelection(textSelection.end,textSelection.end);
		}
		$('#'+textAreaId).trigger('input');
	},100);
}

$(document).ready(function(){

	/* INITIATE SLIDERS  (on doc ready) 
	--------------------------------------------------------------------------------------*/
	/*only if they are shown by CSS (wide enough screen, or touch interaction)*/		
	if ($(window).width() > 520 || $("html").hasClass("has-touch")){
		$(".sliderWrapper").each(function(){
			var s = $(this).find("div");
			var idSplit = s.attr("id").split("-");
			var sMin = s.attr("data-sliderMin")?parseInt(s.attr("data-sliderMin")):1;
			var sMax = s.attr("data-sliderMax")?parseInt(s.attr("data-sliderMax")):100;
			var sStep = s.attr("data-sliderStep")?parseFloat(s.attr("data-sliderStep")):1;
			var logic = s.attr("data-sliderLogic")?s.attr("data-sliderLogic"):"none";
			var delay = s.attr("data-frameId")?parseInt(s.attr("data-frameId"))*500:0;
				
			goSlider(
				idSplit[0]
				,idSplit[1].replace("Slider","")
				,sMin
				,sMax
				,sStep
				,logic
				,delay
			);
			
			//take care of sliders with a section of premium values (atm: ONLY fontsize slider)
			if(s.attr("data-premiumValue") && s.attr("data-premiumTrigger")) {
				//calc width of overlay (how large section is premium?)
				
				//wait to ensure slider is loaded first
				setTimeout(function(){
				
					//convert premiumValue to sliderpoint, as sliderlogic can differ
					var premiumValuePoint = mapToSlider({
						val: parseInt(s.attr("data-premiumValue"))
						,min:sMin
						,max:sMax
						,logic:logic
					});
				
					//NOTE: currently only implemented for '>=' values
	//				if (s.attr("data-premiumTrigger") === "ge")
						var w = Math.round(100 - premiumValuePoint / (sMax - sMin) * 100);
				
					//s.prepend($('<div class="ftPremiumSliderOverlay" style="width: '+w+'%;"><img src="http://cdn1.ftimg.com/images/ft-dynamic-premium-stars-only-sprite.png"><span>Premium</span></div>'));
					s.prepend($('<div class="ftPremiumSliderOverlay" style="width: '+w+'%;"></div>'));
				},500);
			}
		});
	}






	/* FT ONOFF SWITCH  (replaces checkboxes with switches (sliders) 
	--------------------------------------------------------------------------------------*/
	var $html = $("html");
	
	if (!$html.hasClass("oldIE") && !$html.hasClass("simpleBrowser")) {

		$(".toggleValue input[type='checkbox']").each(function(){
			var checkbox = $(this);
			var id = checkbox.attr('id').substring(0, checkbox.attr('id').indexOf('-'));
			var formParam = checkbox.attr('id').substring(checkbox.attr('id').indexOf('-')+1);
			var stateClass = (checkbox.is(':checked')) ? "on" : "off";
	
			var switchWrapper = $('<div class="ft-onoff-switch-wrapper cf '+stateClass+'"></div>').insertAfter(checkbox);

			var beforeSwitchLabel = $('<span class="ft-onoff-switch-label ft-onoff-switch-label-before">OFF</span>').appendTo(switchWrapper);

			var switchSlider = $('<div id="'+id+'-'+formParam+'Slider" class="ft-onoff-switch"></div>').appendTo(switchWrapper);

			var afterSwitchLabel = $('<span class="ft-onoff-switch-label ft-onoff-switch-label-after">ON</span>').appendTo(switchWrapper);
				
			checkbox.hide();

			//insert slider, extended by it's class 'ft-onoff-switch', and logic 'onOfSwitch', to act as switch
			goSlider(id,formParam,0,1,1,'onOffSwitch',0);

			switchSlider.on("slide",function(e,ui){
				//log("switchSlider slide");
				switchWrapper.toggleClass("on off");
				if (switchWrapper.hasClass("on"))
					checkbox.prop("checked",true);
				else
					checkbox.prop("checked",false);
			});

			$.each([beforeSwitchLabel, afterSwitchLabel], function(i,v) {
				v.on('click', function(){
					//log("switchLabel click");
					if ($(this).hasClass('ft-onoff-switch-label-before')
						&& !$(this).hasClass('off')) {
						switchWrapper.removeClass('on').addClass('off');
						checkbox.val("off");
						checkbox.prop("checked",false);
					}
					else if ($(this).hasClass('ft-onoff-switch-label-after')
						&& !$(this).hasClass('on')) {
						switchWrapper.removeClass('off').addClass('on');
						checkbox.val("on");
						checkbox.prop("checked",true);
					}
					checkbox.trigger('change');
				})
			});
		});
	}
	
	
	
	
	/*show spinner on create logo btn click*/
	$statusImgDiv = $(".logoStatusImageDiv");
	$statusImg = $statusImgDiv.find(".logoStatusImage");
	
	$(".ft-create-logo-btn").on("click", function(e){		
		$statusImg.attr("src", "http://cdn1.ftimg.com/spinner.gif");
		$statusImgDiv.removeClass("hide");
	
	});
});
/*tailor meta viewport tag for old Androids - can't do on server for dynamic
//TODO: test, working? (now using JSP header/trailer
if (window.navigator.userAgent.match(/Android ([0-9]+)/) && RegExp.$1 < 3) { //old Androids
	var $metaView = $("meta[name=viewport]");
	var oldAndroidMetaViewContent = $metaView.attr("content") + ", minimum-scale=1.0";
	$metaView.attr("content", oldAndroidMetaViewContent);
}*/

//shutter
//if(!imagebot){
//	var shutterCall=$.ajax({url:"/Ajax/shutterStock?searchTerm="+encodeURIComponent(""),dataType:"html",timeout:3e4}).done(function(e){$(".js-shutter-container").append(e),$(".js-shutter-logo").addClass("faded-in")});
//}
var isIE6 = navigator.userAgent.toLowerCase().indexOf('msie 6') != -1;
var isIE7 = navigator.userAgent.toLowerCase().indexOf('msie 7') != -1;

var MODE_IMAGEBOT=1;
var APP_WEB="web";
var APP_CHROME="chrome";

var ft = ft || {};

if (!ft.dynamicForms) {
	ft.dynamicForms = {};
}

var manualUpdateMode = false;
//only defined on FT...
var isAtLeastPremiumMember = isAtLeastPremiumMember || false;

function DynamicForm(id,mode,app,updateImmediately,fthost) {
	this.id=id;
	this.mode=mode;
	this.app = app || APP_WEB;
	this.ftExtension=null;
	this.host = fthost;
	this.formChange=true;
	this.proxyFormId="proxyform-"+id;
	this.proxyForm= document.getElementById(this.proxyFormId);
	if (!this.proxyForm) {
		log("proxyform not found:"+this.proxyFormId);
	}

	this.valueMap={
		fontsize:function(v){
			
			if(parseInt(v)>200 && (this.mode == MODE_IMAGEBOT || !isAtLeastPremiumMember))
				return 200; //for non Premimum (including basic) members, 200 is max size (same for all for IB)
				
			return v;
		}
		,extAnim:function(v) {
			return "gif";
		}
		,ext:function(v) {
			if (v == "gif" || v == "jpg")
				return v;
			return "png";
		}
		/*,text:function(v){
			if (v.length>50)
				return v.substr(0,50);
			return v;
		}*/
	};

	//this.oldFormParams=""; //moved to updateHandler
	this.updateImmediately=updateImmediately;
	
	if (this.app == APP_CHROME) {
		this.host=this.host || "http://www.flamingtext.com";
	}
	
	this.docReady = false;
	
	this.registerChangeEvents();
	this.init();
	
	ft.dynamicForms[id] = this;
	this.test = function() {
		window.alert("this is dynamicform.test()");
		logger.info("ftExtension");
		logger.info(ftExtension);
		ftExtension.test();
		logger.info("called");
	};
}

DynamicForm.prototype.registerChangeEvents = function() {
	if (!isIE6) {
		var df = this;
		
		var changeFunction = function(evt){
			//log($(this).prop('type') + " " + evt.type + " event");
			var df = evt.data.df;
			
			if(df.docReady){
				//log("doc ready: call checkFormChange");
				//this will help not making too many unneccessary image requests when 2+ parameters change quickly
				setTimeout(function(){
					df.updateHandler.checkFormChange();
				},100);
			}
			else{
				df.updateImmediately = true;
				//log("doc NOT ready: call checkFormChange when ready");
				$(document).ready(function() {
					df.updateHandler.checkFormChange();
				});
			}
			//var str = $(this).attr('id')+":fired "+evt.type;
			//log(str);
		};
		
		//use live event so that we capture changes made before document.ready
		//use die event first to remove events(this is needed for imagebot -
		// when you select and unselect logo several times it initialises DynamicForm object and this live() execeuted several times,
		// so we remove prevoiusly attached handlers.
			
		//replave live/die with on/off as live/die are deprecated in jquery1.9
		//$(":input",$("#proxyform-"+df.id)).die('change').live('change', {df: df}, changeFunction);
		//$('textarea,select,input:text',$("#proxyform-"+df.id)).die('keyup').live('keyup', {df: df}, changeFunction);
		$("#proxyform-"+df.id).off('change',":input").on('change',":input", {df: df}, changeFunction);
		$("#proxyform-"+df.id).off('keyup','textarea,select,input:text').on('keyup','textarea,select,input:text', {df: df}, changeFunction);
	}
}

DynamicForm.prototype.init = function() {
	var df = this;
	//when ready
	$(document).ready(function() {
		df.docReady = true;
		
		df.updateHandler = new UpdateHandler(df);
		df.updateHandler.init();
		
		setupBoxes();
		
		if (df.mode == MODE_IMAGEBOT) {
			var changeLogo = function(evt) {
				//window.alert("change:"+$(this)+":"+$(this).val()+":"+id);
				//window.alert("XX"+ "&text="+$("#"+id+"-text").val());
				ftExtension.showLogoPopup(df.id,"script="+$(this).val()+"&text="+$("#"+df.id+"-text").val());
			}
			var initChangeLogo = function() {
				$("#"+df.id+"-changeLogo").change(changeLogo);
			};
			initChangeLogo();
			

		}
		
		if(!isIE6 && df.updateImmediately){
			df.updateHandler.checkFormChange();
		}
		//log("id:"+"#proxyform-"+df.id+"selector:"+$('input:text',$("#proxyform-"+df.id)).attr('id'));
	});
};


function UpdateHandler(df) {
	//log("update handler");
	var ret= {
		dynamicForm: df,
		id: df.id,
		mode: df.mode, // 0 for standard, 1 for svg-edit
		currentHttpRequest: null,
		working: false,
		originalImageSrc: null,
		logoPreviewDivId: "logoPreview-"+df.id,
		imageId: "logoImage-"+df.id,
		statusImageId: "statusImage-"+df.id,
		statusElement: null,
		errorStatusId: "errorStatus-"+df.id,
		imageNoteId: "logoImageNote-"+df.id,
		imageElement: null,
		maxHttpRequestTime: 40000, //timeout for ajax call
		oldFormParams:"",
		currentFormParams:"",
		params:"",
		maxImageWidth: 630,
		maxImageHeight: 250,
		
		init: function() {
			this.statusElement =  document.getElementById(this.statusImageId);

			this.imageNote = $("#"+this.imageNoteId);
			this.fullSizePreview = false;
			
			if (!this.statusElement) {
				log("unable to find status element:"+this.statusImageId);
			} else {
				this.hideStatus(); //HACK: because IE doesn't fire image.load on init
			}
			if (this.mode != MODE_IMAGEBOT) {
				this.imageElement =  document.getElementById(this.imageId);
				if (this.imageElement) {
					var me = this;
					this.imageElement.startTime= 0;
					this.imageElement.onload=function() {
						//only show for premium members as we only give live previews of 200+ font sizes for them.
						if (isAtLeastPremiumMember){
							///we need to figure out new natural width and height (img.width/height reports scaled size)
							var natWidth, natHeight;
							if(me.imageElement.naturalWidth){
								natWidth = me.imageElement.naturalWidth;  
								natHeight = me.imageElement.naturalHeight;  
							} else {
								//img is already loaded, we just need the browser to render it unscaled, and then query it's size
								var natImg = new Image();
								natImg.src = me.imageElement.src;
								natWidth = natImg.width;  
								natHeight = natImg.height;  
							}

							$(".js-logo-dimensions").removeClass("hide");
							$(".js-logo-dimensions-width").html(natWidth);
							$(".js-logo-dimensions-height").html(natHeight);
						}
						me.imageLoaded();
					};
					this.imageElement.onerror=function() {me.imageErrored();};
					this.originalImageSrc = this.imageElement.src;
				} else {
					//log("unable to find image element:"+this.imageId);
				}
				
				
				$(".js-update-preview-btn").on("click", function(){
					manualUpdateMode = false; //to get through to generate image
					ret._getNewImage();
					$(".js-update-preview-div").addClass("hide");
				});
			}
			
			
			this.logoPreviewDiv = document.getElementById(this.logoPreviewDivId);
			this._initScroll();
		},

		_initScroll: function(){
/*
			var ie = navigator.appVersion.indexOf("MSIE")!=-1;
			var ieVersion = parseFloat(navigator.appVersion.split("MSIE")[1]);
			var ipad = navigator.userAgent.indexOf("iPad") != -1;
			var scrollEnabled = true;
			if (ipad || (ie && ieVersion < 8))
				scrollEnabled = false;
			
			//does not work for ie7
			if(scrollEnabled) { //if(!ie || ieVersion>=8)
				var top = $(this.logoPreviewDiv).offset().top - parseFloat($(this.logoPreviewDiv).css('marginTop').replace(/auto/, 0));
				$(window).bind('scroll.ft',{self:this},function (e) {
					var updateHandler = e.data.self;
					//if we are in a scalled mode
					if(!updateHandler.fullSizePreview){
						var preview = $(updateHandler.logoPreviewDiv);
						var winY = $(this).scrollTop();
						if (winY >= top) {
							var w = $(".logoPreviewWrapper").outerWidth();
							preview.addClass('logoPreviewFixed');
							preview.css({width:w-2});
						} else{
							preview.removeClass('logoPreviewFixed');
						}
					}
					return false;
				});
				$(window).trigger('scroll.ft');//in case we go away and click back
				this._scaleImage();
			}
*/
			
		},
		updateImage: function(src,params,data) {
			var self = this;
			//log("updateImage:mode="+this.mode);
			if (this.imageElement) {			
				this.imageElement.startTime=new Date().getTime();
				//HACK to fix Firefox animated gif display bug (freezes at first frame when replaced at least twice)
				//fix: force repaint by hide n' show with timeout between
				//TODO: replace with proper check
				if(params.indexOf("-anim-logo") > -1){
					var ii = new Image();
					var $imageElement = $(this.imageElement);

					//has to happen AFTER image has been loaded
					$(ii).one("load", function(){
						$imageElement.attr("src", src);
						//$imageElement.addClass("hide");
						$imageElement.css("opacity", ".99");
						
						//need to update min-height of parent container so this doesn't case page to jump
						/*var h = $imageElement.height();
						if (h > 150)
							$imageElement.parents(".logoPreview").css("min-height", h);
						*/

						setTimeout(function(){
							//show image again
							//$imageElement.removeClass("hide");
							$imageElement.css("opacity", "1");
						},0);
					});
					ii.src = src;
				} else {
					this.imageElement.src = src;
				}
			}
 			else {
				if (this.mode == MODE_IMAGEBOT) {
					updateFtLogo(this.id,src,params,data);
				}
				this.clearStatus();
 				this.working=false;
				if (this.statusElement){
					this.hideStatus();
				}
			}
		},

		failed: function(str,params) {
			this.setStatus(str);
			//log(str);
			this.working=false;
			this.statusElement.src="http://cdn1.ftimg.com/fail.gif"
			if (this.mode == MODE_IMAGEBOT) {
				failFtLogo(this.id,str,params);
			}
		},
		hideStatus: function(){
			//this.statusElement.src="http://cdn1.ftimg.com/images/x.gif"; //why?

			/*hide using CSS class instead*/
			$(this.statusElement).parent().addClass("hide");

			//if (this.mode != MODE_IMAGEBOT) {
				/*$(".fixedStatusDiv").removeClass("active"); -NOT USED*/
				//$(this.statusElement).parent().css({visibility:"hidden"});
			//}
		},
		imageLoaded: function() {
			var endTime = new Date().getTime();
			//log("image loaded");
			this._scaleImage();
			this._updateTooltipPosition();
 			this.clearStatus();
 			//we already setWorking(false) in success handling of _getNewImage() AJAX call
 			//this.working=false;
 			
 			//only hide status if there's not already another request undergoing!
 				//this happens if the image loads slowly and finishes loading only AFTER another ajax call has already been started.
 			if(df.updateHandler.ready()){
 				this.hideStatus();
 			}
			if (this.imageElement.startTime !== 0) {
				statbot('sendAction','image_load_time',""+endTime - this.imageElement.startTime);
			}
		},

		_updateTooltipPosition: function(){
			//TODO: move tooltip up/down as much as logoWrapper changed in height.
			var newH = $(this.logoPreviewDiv).height();
			if(!this.lastH)
				this.lastH = newH;
			var diff =  newH - this.lastH;
			//generic selectors works because only one tooltip showed at once
			$(".ft-tooltip").first().css({"top" : "+="+diff});

			this.lastH = newH;
		},

		//_scaleImage now only detects if image was scaled by CSS, no longer does the scaling
		// 6 May 2013 /Jonas
		//this.fullSizePreview - true if mode is "full size image preview", false if mode is "scaled image preview"
		_scaleImage: function(){
			//don't show note or allow full size if
			//screen does not have any extra space for logo to expand to
			if(window.innerWidth < 840) //width where right column starts to show
				return;
			
			//get img natural width and height
			var natWidth;
			var natHeight;
			var $img = $(this.imageElement);

			if ($img.prop('naturalWidth') !== undefined) {
				natWidth = $img.prop("naturalWidth");
				natHeight = $img.prop("naturalHeight");
			}
			//old browsers
			else {
				var $tmpImg = $('<img/>').attr('src', $img.attr('src'));
				natWidth = $tmpImg[0].width;
				natHeight = $tmpImg[0].height;
			}

			//find if img is bigger than wrapper width / maxheight (250px)
			if (natWidth > $(".logoPreviewWrapper").outerWidth()
			|| natHeight > 250){
				this._addFullSizeNote(!this.fullSizePreview);
			} else {
				this.imageNote.html("");
				this.imageNote.addClass("hide");
			}
		}
		,_addFullSizeNote: function(fullsize){
			var self = this;
			var alert;
			
			if(fullsize){
				alert = $("<div><img src=\"http://cdn1.ftimg.com/images/alert-yellow.png\"/> Note: Preview image has been scaled. </div>");
			}
			else{
				alert = $("<div><img src=\"http://cdn1.ftimg.com/images/alert-yellow.png\"/> Note: Image shown at maximum preview size. </div>");
			}
			var link = $("<a href=\"#\"> Toggle preview size</a>");
			link.bind('click.ft',{df:self, fullsize:fullsize}, function(e){
				e.preventDefault();
				var df = e.data.df;
				df.fullSizePreview = fullsize;
				$(self.imageElement).toggleClass("fullSize");
				df._scaleImage();
			});
			this.imageNote.html("");
			this.imageNote.append(alert);
			this.imageNote.append(link);
			this.imageNote.removeClass("hide");
		}
		,ready: function() {
			return !this.working;
		},
		// Not supportted in IE6
		abortCurrentHttpRequest: function() {
			log("abortCurrentHttpRequest: .working=false");
			this.working=false;
			if (!isIE6 && this.currentHttpRequest) this.currentHttpRequest.abort();
		},
		setStatus: function(str) {
			var xx = document.getElementById(this.errorStatusId);
			if (xx) {
				xx.innerHTML="<small style='color:red;'>"+str+"</small>";
				$(xx).removeClass("hide");
			}
				
			//else log("no errorStatus div");
		},

		imageErrored: function() {
 			this.setStatus("Image Errored");
 			this.working=false;
 			this.statusElement.src="http://cdn1.ftimg.com/fail.gif";
		},

		clearStatus: function() {
			var xx = document.getElementById(this.errorStatusId);
			if (xx) {
				xx.innerHTML="";
				var $xx = $(xx);
				if(!($xx.hasClass("hide")))
					$(xx).addClass("hide");
			}
		},

		setWorking: function(val) {
			this.working=val;
			if(this.working){
				/* center using only CSS
				var imgWidth = $(this.imageElement).width();
				var imgHeight = $(this.imageElement).height();
				
				var statusSize = $(this.statusElement).parent().height();

				var left = 0; var top = 0;
				if(statusSize < 20){
					statusSize = 20;
				}else{
					left = (imgWidth-statusSize)/2;
					top = (imgHeight-statusSize)/2;
				}*/
				
				this.statusElement.src= "http://cdn1.ftimg.com/spinner.gif";

				if( this.mode==MODE_IMAGEBOT ){
					getFtLogo(this.id, this.params);
				}

				if (this.mode != MODE_IMAGEBOT) {
					/*show using CSS class */
					$(this.statusElement).parent().removeClass("hide");
					
					/* centering is done automatically via CSS

					$(this.statusElement).parent().css({visibility:"visible",left:left,top:top});
					$(this.statusElement).css({
						"margin-top":"50%"
						,"margin-left":"50%"
						,"top":-$(this.statusElement).outerHeight()/2
						,"left":-$(this.statusElement).outerWidth()/2
					});*/				
				
					/* tooltip about dynamic updates
					if ($("html").hasClass('has-localStorage') 
					&& !(localStorage.getItem('ft-dynamic-seendynamicSpinnerTooltip') === "true")) {
						var toolTipMsg = "This preview logo <br>updates automatically.";
						
						showTooltip(toolTipMsg, $(".logoStatusImageDiv").first(), function(){log("tooltip hidden!");});
						localStorage.setItem('ft-dynamic-seendynamicSpinnerTooltip', "true");
					}
					*/
				}
			}
		},
		
		checkFormChange: function(){
			//log("Caller:"+arguments.callee.caller.toString());
			//CAM: var reqAvail = this._isHttpRequestAvailable();
			var imageOutdated = this._isImageOutdated();
			//log("_checkFrame:reqAvail="+reqAvail+";imageOutdated="+imageOutdated);
			// CAM: if(reqAvail && imageOutdated) // {}
			if(imageOutdated){
				//if premium and fontSize > 200 (not for IB)
				if(this.mode != MODE_IMAGEBOT && isAtLeastPremiumMember && parseInt($("#"+1+"-fontsize").val(), df.proxyForm) > 200) {
					manualUpdateMode=true;
					//show update preview div with button
					$(".js-update-preview-div").removeClass("hide");
					//abort calls..
					if (!isIE6 && this.currentHttpRequest) {
						this.currentHttpRequest.ftAborted=true;
						this.currentHttpRequest.abort();
					}
					//hide spinner
					this.clearStatus();
	 				this.working=false;
					if (this.statusElement){
						this.hideStatus();
					}
				} else {
					manualUpdateMode=false;
					$(".js-update-preview-div").addClass("hide");
				}
				this._getNewImage();
				return true;
			}
			return false;
		
		},
		_isHttpRequestAvailable: function (){			
			if(!this.working) {
				return true;
			}
			var ms = this.httpRequestStartTime ? ((new Date().getTime())-this.httpRequestStartTime) : 0;
			//log("ms="+ms);
			if(ms >= this.maxHttpRequestTime){
				return true;
			}
			return false;
		},
		_getFtHost: function() {
			if (df.host) {
				return df.host;
			}
			var ret;
			ret='http://'+document.location.hostname;
			if(document.location.port!=80){
				ret+=":"+document.location.port;
			}
			return ret;
		},
		_isImageOutdated: function (){
			this.currentFormParams = this._getFtHost();
			this.currentFormParams+='/net-fu/image_output.cgi?';
			this.params=buildParams(df.proxyForm,{},df.id+"-",df.valueMap);
			// wouldn't we need &imageoutput??
			this.currentFormParams += this.params; // + 'imageoutput=true';
			if (this.mode == MODE_IMAGEBOT) {
				this.currentFormParams += '&_dataurl=true';
			}
			
			//log("this.currentFormParams="+this.currentFormParams+";this.oldFormParams="+this.oldFormParams+";df.updateImmediately"+df.updateImmediately);
			
			if(this.currentFormParams != this.oldFormParams){
				return true;
			}
			return false;
		},
		_getNewImage: function() {
			if(manualUpdateMode){
				//block image request - user has to manually click "update"
				return false;
			}
			var updateHandler=this;
			if (!isIE6 && this.currentHttpRequest) {
				this.currentHttpRequest.ftAborted=true;
				this.currentHttpRequest.abort();
			}
			//TODO: remove this
			//currently happens on ie9 in imagebot when logo options are opened in properties panel and change is triggered for the first time
			if(this.currentFormParams.indexOf('script=')==-1)
				return;
			var startTime = new Date().getTime();
			this.currentHttpRequest =$.ajax({
				//type:"get"
				url:updateHandler.currentFormParams
				,cache:false
				//,async: true //needed?
				,dataType: "json"
				,timeout:this.maxHttpRequestTime
				,beforeSend: function(req){
					req.updateHandler=updateHandler;
					req.params=updateHandler.params;
					req.updateHandler.setWorking(true);
					//req.updateHandler.statusElement.src="http://cdn1.ftimg.com/spinner.gif";
					req.updateHandler.clearStatus();
					req.updateHandler.oldFormParams=updateHandler.currentFormParams;
				}
				,success: function (json_imgObject, textStatus, req) {
					var endTime = new Date().getTime();
					if (typeof json_imgObject.gimpTime !== "undefined") {
						statbot('sendAction','image_gen_time',""+(endTime-startTime));
					} else {
						statbot('sendAction','image_oldgen_time',""+(endTime-startTime));
					}
					
					
					req.updateHandler.setWorking(false);
					//if something changed while this request was processing we need to generate new image and dont update preview
					if(!req.updateHandler.checkFormChange()){
						if (json_imgObject.src) {
							//log("src:"+json_imgObject.src);
							req.updateHandler.updateImage(json_imgObject.src,req.params,json_imgObject.data);
						} else if (json_imgObject.error) {
							req.updateHandler.failed(json_imgObject.error,req.params);
						} else {
							req.updateHandler.failed("bad response from server",req.params);
						}
					}
				}
				,error: function(req,textStatus) {
					if (req.ftAborted)
						return;
					if (req.status || textStatus==="timeout" || req.updateHandler.mode == MODE_IMAGEBOT) {//0 is when page is redirected
						if (textStatus === "timeout") {
							statbot('sendAction','image_gen_error',"timeout");
							req.updateHandler.failed("Click 'Create Logo' to continue....",req.params);
						} else {
							statbot('sendAction','image_gen_error',""+textStatus);
							var x = "Http Status:"+req.status+":"+textStatus;
							//if (typeof req.responseText !== "undefined") {
								//x = req.responseText;
								//responseText could be huge like "The server is blah blah blah. Plesae try again later"
							//}
							//TODO: should we just retry?
							req.updateHandler.failed(x,req.params);
						}
					} else {
						req.updateHandler.failed("",req.params);
					}

				}
			});
			this.currentHttpRequest.ftAborted=false;
		}
		

	};
	//log("done update handler");	
	return ret;

}

function logProperties(msg,obj) {
for (var i=0; i < obj.length;i++) {
	element = obj[i];
	name=element.name;
	value= element.value;
	log(msg+":"+name+"="+value);
}
}


function setupBoxes() {
	//log("setup boxes");
	$(".box_title_link, .group_title").find('a').click(function(e){
		e.preventDefault();
	});
	//show/hide based on if we have 'active' class on the title
	$(".box_inner, .box_group").each(function(){
		var isActive = $(this).parent().find(".box_title_link, .group_title").eq(0).hasClass('active');
		if(isActive)
			$(this).show();
		else
			$(this).hide();
	});
	//hide summary for now
	$(".box_summary").hide();
	
	//click handler
	$(".box_title_link, .group_title").click(function(){
		var fn = function(p,hidden){
			p.toggleClass("active");
			var isActive = p.hasClass('active');
			if(isActive)
				p.find('img').prop('src', "http://cdn1.ftimg.com/images/minus.png");
			else
				p.find('img').prop('src', "http://cdn1.ftimg.com/images/plus.png");
			//need to find closest .box_title now since .box_title_link is a child of it
			if(hidden){//for other frames in animator set css because slideToggle does not work when in hidden div
				if(isActive)
					p.closest(".box_title, .group_title").next().css("display","block");
				else
					p.closest(".box_title, .group_title").next().css("display","none");
			}
			else
				p.closest(".box_title, .group_title").next().slideToggle("fast");
		}
		var p = $(this).closest(".box_title_link, .group_title");
		fn(p);
		var isActive = p.hasClass('active');
	
		//if we on animator page
		var curFrame = $("#currentFrameId").length? parseInt($("#currentFrameId").val()) : false;
		if(typeof(curFrame)=='number'){
			var classList = p.attr('class').split(/\s+/);
			var clazz = undefined;
			$.each( classList, function(i, item){
				if (item.indexOf('ft_') == 0) {
					clazz=item;
					return false;
				}
			});
			if(clazz){
				var otherFrames=$("."+clazz).not(p).filter(function(i){
					if(isActive)
						return !$(this).hasClass('active');
					else
						return $(this).hasClass('active');
				});
				$.each(otherFrames,function(i,f){
					fn($(f), true);
				});
			}
		}
	});
}
//el - a parent element within which to take parameters, can be a form or a div(in case for animator)
//exclude - an object with names to be excluded 
//eg exclude = {url:1, msSleep:1};
//replaceParam - sometimes we want to strip something from param name, eg "frame0", or "frame\d", ie can use regex here
//valueMap - mapping function for values, used to restrict certain parameters.For example valueMap={fontsize:function(v){if(v>200) return 200;return v}}
//retruns params with & at the end, as most of the time we need it anyway

function buildParams(el, exclude, replaceParam, valueMap){
	var params = "";
	var inputs = $(":input", $(el)).filter(function(index){
		return !exclude[$(this).attr('name')];
	});//find all inputs within el and filter them
	
	$.each(inputs,function(i,v){
		var name = $(v).attr('name');
		var value = $(v).val();
		var add=true;

		if (name && name !=""){
			if(name === "fontnameImage")
				return true; //input used as non JS fallback, is not a param - ignore (return true ==== continue in $.each)
				
		 	if(replaceParam){
				var re = new RegExp(replaceParam);
				name=name.replace(re,"");
			}
			//if (name == "ext") {
				//value="png";
			//}
			//else if (name == "extAnim")
				//value="gif";
			//else
			if ($(v).prop('type')=="checkbox") {
				value = $(v).prop('checked')?"on":"off";
			}
			else if ($(v).prop('type')=="radio") {
				if (!$(v).prop('checked'))
					add=false;
			}
			if (add){
				if(valueMap && name in valueMap)
					value = valueMap[name](value);
				params+=name+"="+encodeURIComponent(value)+"&";
			}
		}
	});
	return params;
}
//$(document).ready(setupBoxes);
function dcf(fn, fni) {
//window.setTimeout('cf("'+fn+'","'+fni+'");',50); //not needed, correct size requested via 
						//handleFontPopup.retina option
}
function cf(fn,fni) {
var y="";
n=document.getElementById(fn);
x=n.value;
for(i=0;i<x.length;i++){
 if(x.charAt(i)==' ')y=y+'+';
 else y=y+x.charAt(i);
}

// if imagebot
var previewW = (typeof(window.dontUseMeAskCameron)!='undefined')? 140 : 330;
var previewH = (typeof(window.dontUseMeAskCameron)!='undefined')? 32 : 75;
	previewW *=pixelRatio;
	previewH *=pixelRatio;
/*
if(document.images)if (document.images[n])document.images[n].style('background-image','http://cdn1.ftimg.com/fonts/preview/'+previewW+'x'+previewH+'/'+y+'.png');
else document.getElementById(fni).style('background-image','http://cdn1.ftimg.com/fonts/preview/'+previewW+'x'+previewH+'/'+y+'.png');*/
};

var fontUrlCache = {};

var FontsManager = function(opts){
	var queue = [];
	var count = 0;
	var defaults = {
		maxCalls:5
	};
	var options = $.extend({},defaults,opts);
	var isReady = function(){
		return count<options.maxCalls;
	};
	this.callCompleted = function(id){
		count--;
		queue[id]=undefined;
		setTimeout(function(){
			if(isReady()){
				//run from the beginning
				var i=0;
				while(i<queue.length && typeof(queue[i])=='undefined')
					i++;
				if(i<queue.length){
					queue[i]();
				}
				//setTimeout(function(){queue.shift()();},0);
			}
		},10);
		//log('complete:'+count+";"+queue.length);
	};
	
	this.run = function(id,fn){
		var runFn = function(){
			count++;
			fn();
		};
		if(isReady())
			runFn();
		else
			queue[id] = runFn;//overwrite with latest
		//log('run:'+count+";"+queue.length);
	};
};

(function($){
	//fontManager
	$.widget("ft.fontmanager", {
		options: {
			idPrepend: "font_"
			,oldvalue: null
			,statusImageValue: "http://cdn1.ftimg.com/images/x.gif"
			,loadingImg: "http://cdn1.ftimg.com/images/loading.gif"
			,errorMessageValue: null
			,url: ''
			,disabled: false
			,maxHttpRequestTime: 20000
			,gettingNewImageLabel: ""//Getting new image
			,inputs:[]
			,conditionalInputs:{
				"script":{
					"banner":{colorTextR:0,colorTextG:0,colorTextB:204,sunkenText:false,textMode:1,textBorder:0,halignText:0,valignText:0}
					,"plain-logo":{colorTextR:0,colorTextG:0,colorTextB:204}
				}
			}
			,getImgOnInit: false
			,defaultText:"abc"
			,fontname:""
			,fontsManager:undefined
		},
		
		_create: function() {
			this._initFontManager();
		},
		
		_initFontManager: function(){
			var o = this.options;

			this.statusDiv = this._initSiblingsDiv("statusDiv", "fontStatusMessage");
			this.errorsDiv = this._initSiblingsDiv("errorsDiv", "fontErrorsMessage");		
			this.imageLoaded = true;
			this.working = false;
			
			$(this.widget()).bind('fontChanged',{self:this}, function(ev){ev.data.self._checkFrame();});
			
			this._initInputs();
			
			
			this._registerChangeEvents();
			this._initPreviewImage();//calls this._checkFrame();
		},
		_initInputs: function(clazz){
			var self = this;
			var o = this.options;
			this.inputs = $([]);
			$.each(o.inputs, function(i,v){
				var jq = $(v);
				if(jq.length)
					self.inputs = self.inputs.add(jq);
			});
		},
		_initSiblingsDiv: function(id,clazz){
			var ret = $(this.element).siblings(clazz);
			if(!ret.length){
				ret = $("<div id=\""+this.options.idPrepend+id+"\" class=\""+clazz+"\"></div>");
				$(this.element).closest('div').append(ret);
			}
			return ret;
		},
		_registerChangeEvents: function (){
			var self = this;
			this.fontmanagerCount = $(":ft-fontmanager").length;
			
			$.each(this.inputs, function(i,v){
				self._registerChangeEvent($(v));
			});
			//if it is a select
			this.inputs.filter('select').each(function(){
				self._registerKeyUpEvent($(this));
			});
			
		},
		_registerChangeEvent: function (el){
			var o = this.options;
			
			el.bind('change.font.changed',{fm:this, fm_count:this.fontmanagerCount}, function(event){
				if(o.disabled)
					return false;

				var fm = event.data.fm;
				
				if(o.fontsManager){
					//log('change - run now');
					o.fontsManager.run(event.data.fm_count, function(){$(fm.widget()).trigger('fontChanged');});
				}
				else{
					var n = parseInt($(this).attr("delaycheck")) + event.data.fm_count*100;
					if(!n)
						n = event.data.fm_count*100;
					//totalcalls++;
					//log("fm:"+event.data.fm_count+";n="+n+";calls="+totalcalls);
					if(n){
						setTimeout(function(){$(fm.widget()).trigger('fontChanged');},n);
					}
					else{
						$(fm.widget()).trigger('fontChanged');
					}
				}
				//fm._devChange(this);
			});
			
			//for some types we want other than basic 'change' handler
			var type = el.prop('type');
			switch (type){
				case "textarea":
				case "text":
					//log($(el).attr('id') + " registering keypress event");
					this._registerKeyUpEvent(el);
					break;
			}			
		},
		_registerKeyUpEvent: function (el){
			var o = this.options;
			el.unbind('keyup.font.changed').bind('keyup.font.changed', {fm:this}, function(event){
				//log("key pressed"+$(this).attr('id'));
				if(o.disabled)
					return false;
				//setTimeout(function(){$(event.data.fm.widget()).trigger('fontChanged');}, event.data.fm_count*50);
				//event.data.fm._devChange(this);
				
				//this is needed because we bind multiple keyups to this but only the last one executes
				$(this).trigger('change.font.changed');
			});			
		},

		_initPreviewImage: function(){
			var o = this.options;
			var self = this;
			this.previewImage = $(this.element);
			this.statusImage = $("#"+this.options.idPrepend+"statusImage");
			//this.errorMessage = $("#"+this.options.idPrepend+"errorMessage");

			var firstLoad = true;
			if (this.previewImage.length){
				this.previewImage.unbind("load error").bind({
					load: function() {
						self._imageLoaded();
					},
					error: function() {
						if(firstLoad)//this is to not show error when refreshing the page
							firstLoad = false;
						else
							self._imageErrored();
					}
				});
				if(o.url)
					this._setUrl(o.url);
			}
			
			if (this.statusImage.length){
				this.statusImage.prop('src',o.statusImageValue);
			}
			//if (this.errorMessage.length)
			//	this.errorMessage.html(o.errorMessageValue);
			
			if(o.getImgOnInit){
				//this._checkFrame();
				if(o.fontsManager)
					o.fontsManager.run(this.fontmanagerCount,function(){$(self.element).trigger('fontChanged');});
				else
					$(this.element).trigger('fontChanged');
			}
				
		},
		
		_imageLoaded: function (){
			var o = this.options;
			this._clearStatus();
			this.imageLoaded=true;
			o.statusImageValue = "http://cdn1.ftimg.com/images/x.gif";
			if (this.statusImage.length)
				this.statusImage.prop('src',o.statusImageValue);
		},
		_clearStatus: function (){
			this.options.errorMessageValue = "";
			//if (this.errorMessage.length)
			//	this.errorMessage.html(this.options.errorMessageValue);
			if (this.errorsDiv.length)
				this.errorsDiv.html(this.options.errorMessageValue).css({'display':'none'});
		},
		_setStatus: function (str){
			this.options.errorMessageValue = str;
			//if (this.errorMessage.length)
			//	this.errorMessage.html("<font size='-1' color='red'>"+this.options.errorMessageValue+"</font>");
			if (this.errorsDiv.length)
				this.errorsDiv.html("<font size='-1' color='red'>"+">>> " + this.options.errorMessageValue+"</font>").css({'display':'block'});
		},
		_failed: function (str){
			var o = this.options;
			this._setStatus(str);
			this.imageLoaded=true;
			o.statusImageValue = "http://cdn1.ftimg.com/fail.gif";
			if (this.statusImage.length)
				this.statusImage.prop('src',o.statusImageValue);
		},
		_imageErrored: function (str){
			var o = this.options;
			this._setStatus("Image Errored: " + str);
			this.imageLoaded=true;
			o.statusImageValue = "http://cdn1.ftimg.com/fail.gif";
			if (this.statusImage.length)
				this.statusImage.prop('src',o.statusImageValue);
		},
		_outdated: function(){
			var reqAvail = this._isHttpRequestAvailable();
			var imageOutdated = this._isImageOutdated();
			return (reqAvail && imageOutdated);
		},
		//return true if new image is generated, flase otherwise
		_checkFrame: function (verification_call){
			if(this._outdated()){
				//log("reqAvail && imageOutdated");
				this._getNewImage(verification_call);
				return true;
			}
			else if(this.options.fontsManager && !verification_call)
				this.options.fontsManager.callCompleted(this.fontmanagerCount);
			
			return false;
		},		
		_isHttpRequestAvailable: function (){			
			var ms = this.httpRequestStartTime ? ((new Date().getTime())-this.httpRequestStartTime) : 0;
			//log("ms="+ms);
			if(!this.working || ms >= this.options.maxHttpRequestTime){
				return true;
			}
			return false;
		},
		_isImageOutdated: function (){
			var o = this.options;
			this.currentParams = "/net-fu/image_output.cgi?";
			this.currentParams += this._buildParams();
			this.currentParams += "fontname="+encodeURIComponent(this.options.fontname)+"&"
			this.currentParams += "imageoutput=true";
			//this.currentParams = this._buildParams();
			//log("currentParams:"+this.currentParams);
			//log("oldvalue     :"+this.options.oldvalue);
			if(this.currentParams != this.options.oldvalue){
				return true;
			}
			return false;
		},
		_buildParams:function(){
			var self = this;
			var params = "";
			var replaceParam = this.options.idPrepend;
			$.each(this.inputs,function(i,v){
				var name = $(v).attr('name');
				var value = $(v).val();
				var add=true;

				if (name && name !=""){
				 	if(replaceParam){
						var re = new RegExp(replaceParam);
						name=name.replace(re,"");
					}
					if (name == "ext")
						value="png";
					else if (name == "extAnim")
						value="gif";
					else if ($(v).prop('type')=="checkbox") {
						value = $(v).prop('checked')?"on":"off";
					}
					else if ($(v).prop('type')=="radio") {
						if (!$(v).prop('checked'))
							add=false;
					}
					if (add)
						if(name == "text" && value=='')
							value = self.options.defaultText;
						params+=name+"="+encodeURIComponent(value);
						params+="&textBorder=0";
						params+="&"+self._processConditionalInputs(name,value);
					}
			});
			return params;
		},
		_processConditionalInputs:function(name, value){
			var ret = "";
			
			if(this.options.conditionalInputs[name]){
				var conditionalValues = this.options.conditionalInputs[name];
				if (conditionalValues[value]){
					var inputs = conditionalValues[value];
					$.each(inputs, function(inp,val){
						ret+=inp+"="+encodeURIComponent(val)+"&";
					});
				}
			}
			return ret;
		},
		_getNewImage: function (verification_call){
			var self = this;
			var o = this.options;
			//log("getting new image");
			
			this._clearStatus();
			o.oldvalue=this.currentParams;

			if (fontUrlCache[this.currentParams]) {
				this.imageLoaded=true;
				this._setUrl(fontUrlCache[this.currentParams]);
				if(this.options.fontsManager && !verification_call)
					this.options.fontsManager.callCompleted(this.fontmanagerCount);
				return;
			}
			else{
				o.statusImageValue = o.loadingImg;
				if(this.statusImage.length){
					this.statusImage.prop("src", o.statusImageValue);
				}

				var jqxhr = $.ajax({type:"get",
					url:this.currentParams,
					async: true,
					beforeSend: function(req){
						self.imageLoaded=false;
						self._setWorking(true);
						self.httpRequestStartTime = new Date().getTime();
					},
					timeout:o.maxHttpRequestTime,
					cache:false,
					dataType: "json",
					success: function (json_imgObject, textStatus, req) {
						self._setWorking(false);
						//log("getNewImage");
						//if something changed while this request was processing we need to generate new image and dont update preview
						if(!self._checkFrame(true)){
							if (json_imgObject.src) {
								self.options.url=json_imgObject.src;
								fontUrlCache[self.currentParams] = self.options.url;
								self._setUrl(self.options.url);
							} else if (json_imgObject.error) {
								self._failed(json_imgObject.error);
							} else {
								self._failed("bad response from server");
							}
						}
					},
					error: function(req,textStatus,exc) {
						self._setWorking(false);
						//log("error:"+textStatus+":"+exc);
						self._failed("error:"+textStatus);
					}
				});
				if(!verification_call && o.fontsManager){
					jqxhr.always(function(){o.fontsManager.callCompleted(this.fontmanagerCount);});
				}
			}
		},
		_setWorking: function (isWorking){
			var o = this.options;
			//url is no longer valid
			if(isWorking){
				this.working = true;
				this.statusDiv.html(o.gettingNewImageLabel).css({'display':'block'});
			}
			else{
				this.working = false;
				this.statusDiv.html("").css({'display':'none'});
			}		
		},
		_setUrl: function (value){
			var o = this.options;
			o.url = value;
			if(this.previewImage.length)
				this.previewImage.attr("src", o.url);
		},

		
		_setOption: function( key, value ) {
			$.Widget.prototype._setOption.apply( this, arguments );
			if(key=="url"){
				this._setUrl(value);
			}
		},

		hasError: function(){
			if(this.errorsDiv.html()!="")
				return true;
			return false;
		},
		recheckFont: function(){
			this.options.oldvalue = null;
			this._checkFrame();
		}
	});

})(jQuery);

$(document).ready(function(){
	//Set a cookie to remember number of fonts per page on page refresh
	$(".ft-font-controls-drop-down").show();
	$(".ft-font-controls").find("select").bind('change',function(){
		var fontsPp = $(this).val();
		$.cookie('fontsPp', null);
		var domain = document.domain;
		var pos = domain.indexOf('flamingtext');
		if (pos > -1)
		{
		domain = domain.substring(pos);
		}
		else{domain = 'flamingtext.com'}
		$.cookie('fontsPp', fontsPp, {path: '/', domain: '.' + domain});
		
		//clear out saerch field on all pages except Font-Search before submitting form
		var location = window.location.href;
		if(location.indexOf("Font-Search") == -1){ 
			var searchField = $(".ft-search-field.search_field");
			searchField.val("");
		}
		
		$(this).closest('form').attr('action',"").submit();
	});
	/*//disabled for now
	//Set a cookie to remember the preview string to use
	$('#font_text').bind('change',function(){
		var previewString = $(this).val();
		$.cookie('previewString', null);
		var domain = document.domain;
		var pos = domain.indexOf('flamingtext');
		if (pos > -1)
			domain = domain.substring(pos);
		else
			domain = 'flamingtext.com';
		$.cookie('previewString', escape(previewString), {path: '/', domain: '.' + domain});
	});
	
	if($('#font_text').length){
		var font_text = $.cookie('previewString');
		if(font_text)
			$('#font_text').val(unescape(font_text));
	}
	*/
	
	$(".ft-font-specific-logo-suggestion-img").bind('load',function(){
		
		$(this).siblings(".ft-font-specific-loadingDiv").remove();
	});
	
	$(".ft-font-preview-size").find('a').click(function(e){e.preventDefault();});
});

function dcp(pn, pni) {
window.setTimeout('cp("'+pn+'","'+pni+'");',50);
}
function cp(pn,pni) {
n=document.getElementById(pn);
x=n.options[n.selectedIndex].value;
if(document.images){
r='';
for(i=0;i<x.length;i++){
c=x.charAt(i);
if(c==' ')r+='_';
else if(c=='(')r+='_';
else if(c==')')r+='_';
else if(c=='$')r+='_';
else if(c=='#')r+='_';
else if(c=='?')r+='_';
else if(c=='%%')r+='_';
else if(c=='&')r+='_';
else if(c=='\'')r+='_';
else if(c=='+')r+='_';
else r+=c;
}
var previewW = (typeof(window.dontUseMeAskCameron)!='undefined')? 140 : 167;
var previewH = (typeof(window.dontUseMeAskCameron)!='undefined')? 28 : 28;
if (pixelRatio == 2) {
	previewW *=2;
	previewH *=2;
}
document.images[pni].src='http://cdn1.ftimg.com/images/patterns/'+previewW+'x'+previewH+'/'+r+'.png';
}}
;
function hidden_cp(pn,pni) {
	n=document.getElementById(pn);
	x=n.value;
	if(document.images){
		r='';
		for(i=0;i<x.length;i++){
			c=x.charAt(i);
			if(c==' ')r+='_';
			else if(c=='(')r+='_';
			else if(c==')')r+='_';
			else if(c=='$')r+='_';
			else if(c=='#')r+='_';
			else if(c=='?')r+='_';
			else if(c=='%%')r+='_';
			else if(c=='&')r+='_';
			else if(c=='\'')r+='_';
			else if(c=='+')r+='_';
			else r+=c;
		}
		var previewW = (typeof(window.dontUseMeAskCameron)!='undefined')? 140 : 167;
		var previewH = (typeof(window.dontUseMeAskCameron)!='undefined')? 28 : 28;
		if (pixelRatio == 2) {
			previewW *=2;
			previewH *=2;
		}
		document.images[pni].src='http://cdn1.ftimg.com/images/patterns/'+previewW+'x'+previewH+'/'+r+'.png';
	}
}
function dcg(gn, gni) {
window.setTimeout('cg("'+gn+'","'+gni+'");',50);
}
function cg(gn,gni) {
n=document.getElementById(gn);
x=n.options[n.selectedIndex].value;
if(document.images){
r='';
for(i=0;i<x.length;i++){
c=x.charAt(i);
if(c==' ')r+='_';
else if(c=='(')r+='_';
else if(c==')')r+='_';
else if(c=='$')r+='_';
else if(c=='#')r+='_';
else if(c=='?')r+='_';
else if(c=='%%')r+='_';
else if(c=='&')r+='_';
else if(c=='\'')r+='_';
else if(c=='+')r+='_';
else r+=c;
}

var previewW = (typeof(window.dontUseMeAskCameron)!='undefined')? 140 : 167;
var previewH = (typeof(window.dontUseMeAskCameron)!='undefined')? 28 : 28;
//window.alert("retina:"+retina);
if (pixelRatio == 2) {
	previewW *=pixelRatio;
	previewH *=pixelRatio;
}

document.images[gni].src='http://cdn1.ftimg.com/images/gradients/'+previewW+'x'+previewH+'/'+r+'.png';
}}
;
function hidden_cg(gn,gni) {
	n=document.getElementById(gn);
	x=n.value;
	if(document.images){
		r='';
		for(i=0;i<x.length;i++){
			c=x.charAt(i);
			if(c==' ')r+='_';
			else if(c=='(')r+='_';
			else if(c==')')r+='_';
			else if(c=='$')r+='_';
			else if(c=='#')r+='_';
			else if(c=='?')r+='_';
			else if(c=='%%')r+='_';
			else if(c=='&')r+='_';
			else if(c=='\'')r+='_';
			else if(c=='+')r+='_';
			else r+=c;
		}
		var previewW = (typeof(window.dontUseMeAskCameron)!='undefined')? 140 : 167;
		var previewH = (typeof(window.dontUseMeAskCameron)!='undefined')? 28 : 28;
		if (pixelRatio == 2) {
			previewW *=2;
			previewH *=2;
		}
		document.images[gni].src='http://cdn1.ftimg.com/images/gradients/'+previewW+'x'+previewH+'/'+r+'.png';
	}
}
// color.js

// convert 0 .. 255 to 00->FF
function getHex2(v) {
d = parseInt(v);
if (d < 0 || d > 255)
	return "00";
return (d<16?"0":"")+d.toString(16);
}

function rgb(r,g,b) {
return getHex2(r)+getHex2(g)+getHex2(b);
}

function updateColor(nn,from_cp) {
	var r = $('#'+nn+'R').val();
	var g = $('#'+nn+'G').val();
	var b = $('#'+nn+'B').val();
	$('#'+nn+'Picker div').css('background-color', "rgb("+r+","+g+","+b+")");
	//$('#'+nn).ColorPickerSetColor({r:r ,g:g ,b:b });

	if(!from_cp){
		if ($('#'+nn).data('colorpickerId')) {
			var cal = $('#' + $('#'+nn).data('colorpickerId'));
			var cp_r = $('.colorpicker_rgb_r input', cal).val();
			var cp_g = $('.colorpicker_rgb_g input', cal).val();
			var cp_b = $('.colorpicker_rgb_b input', cal).val();

			var new_r = $('#'+nn+'R').val();
			var new_g = $('#'+nn+'G').val();
			var new_b = $('#'+nn+'B').val();
			//log("r:"+r+",new_r:"+new_r+",cp_new_r:"+cp_r);
			if(r==new_r && g==new_g && b==new_b
				&& (r!=cp_r || g!=cp_g || b!=cp_b)
				){
				$('#'+nn).ColorPickerSetColor({r:r ,g:g ,b:b });
			}
		}
	};
}

//TODO: deleteme
function cs(nn,frameNum) {
var r=document.getElementById(nn+'R').value;
var g=document.getElementById(nn+'G').value;
var b=document.getElementById(nn+'B').value;
var c = rgb(r,g,b);
document.getElementById(nn+' div').style.backgroundColor="#"+c;

$(document).ready(function(){

	$('#'+nn+'R').change(function(evt, from_cp) {updateColor(nn, from_cp);});
	$('#'+nn+'G').change(function(evt, from_cp) {updateColor(nn, from_cp);});
	$('#'+nn+'B').change(function(evt, from_cp) {updateColor(nn, from_cp);});

	setTimeout(function(){
//	fnQ.push(function(){
	$('#'+nn).ColorPicker({
        	color: c,
        	onChange: function (hsb, hex, rgb) {
			$('#'+nn+' div').css('backgroundColor', '#' + hex);
			$('#'+nn+"R").val(rgb.r).trigger('change',true);
			$('#'+nn+"G").val(rgb.g).trigger('change',true);
			$('#'+nn+"B").val(rgb.b).trigger('change',true);
        	},
		onRestore: function (hsb, hex, rgb) {
			$('#'+nn+' div').css('backgroundColor', '#' + hex);
			$('#'+nn+"R").val(rgb.r).trigger('change',true);
			$('#'+nn+"G").val(rgb.g).trigger('change',true);
			$('#'+nn+"B").val(rgb.b).trigger('change',true);
        	}
	});
	},frameNum*1000);
	//});
});

};

function cs2(nn,frameNum) {
var c=document.getElementById(nn).value;
$('#'+nn+"Picker div").css('backgroundColor',"#" + c);

$(document).ready(function(){

	$('#'+nn).change(function(evt, from_cp) {updateColor(nn, from_cp);});

	setTimeout(function(){
//	fnQ.push(function(){
	$('#'+nn+"Picker").ColorPicker({
        	color: c
        	,onChange: function (hsb, hex, rgb) {
			$('#'+nn+'Picker div').css('backgroundColor', '#' + hex);
			$('#'+nn).val("#"+hex).trigger('change',true);
        	}
		,onRestore: function (hsb, hex, rgb) {
			$('#'+nn+'Picker div').css('backgroundColor', '#' + hex);
			$('#'+nn).val("#"+hex).trigger('change',true);
        	}
	});
	},frameNum*1000);
	//});
});

};

function cs3(nn,frameNum) {

	var c=document.getElementById(nn).value;
	$('#'+nn+"Picker div").css('backgroundColor',"#" + c);

	$(document).ready(function(){
		var $input = $('#'+nn);
		var $picker = $('#'+nn+"Picker");
		var $pickerDiv = $picker.find("div");
		var dragging = false;
		var currColor = "#"+c;
		var touchDevice = ($("html").hasClass("has-touch") && $(window).width() < 1200);
		
		var updateColorInput = function(color) {
			var hex = color.toHexString(true); //true enforces hex6
			$pickerDiv.css('backgroundColor', hex);
			$input.val(hex).trigger('change',true);
		}

		// CAM says: does this work? I think not.
		//$input.change(function(evt, from_cp) {updateColor(nn, from_cp);});

		setTimeout(function(){
	//	fnQ.push(function(){
		$picker.spectrum({
	    	color: currColor
			,chooseText: "Okay"
			,showInput: true
			,clickoutFiresChange: true
			,preferredFormat: "hex6"
			,change: function(color) {
				updateColorInput(color);
	    	}
			,move: function(color) {
				if(touchDevice){ 
					currColor = color; //keep on overwriting currColor, so we use latest when touchend fires
					if(!dragging){ //only kick of new ajax logo request on touchend, for touch devices
						$(document).one("touchend", function(e){
							updateColorInput(currColor);
							dragging = false;
						});
						dragging = true;
					} else { //only update input, don't kick of ajax logo request
						var hex = color.toHexString(true); //true enforces hex6
						$pickerDiv.css('backgroundColor', hex);
					}
				} else {
					updateColorInput(color);
				}
	    	}
		});
		},frameNum*1000);
		//});
	});

};
/*!
 *
 * Color picker
 * Author: Stefan Petre www.eyecon.ro
 * 
 * Licensed under the MIT license
 * 
 * Modified: Cameron Gregory, http:/www.flamingtext.com/
 */
(function ($) {
	var ColorPicker = function () {
		var
			ids = {},
			inAction,
			charMin = 65,
			visible,
			tpl = '<div class="colorpicker"><div class="colorpicker_color"><div><div></div></div></div><div class="colorpicker_hue"><div></div></div><div class="colorpicker_new_color"></div><div class="colorpicker_current_color"></div><div class="colorpicker_hex"><input type="text" maxlength="6" size="6" /></div><div class="colorpicker_rgb_r colorpicker_field"><input type="text" maxlength="3" size="3" /><span></span></div><div class="colorpicker_rgb_g colorpicker_field"><input type="text" maxlength="3" size="3" /><span></span></div><div class="colorpicker_rgb_b colorpicker_field"><input type="text" maxlength="3" size="3" /><span></span></div><div class="colorpicker_hsb_h colorpicker_field"><input type="text" maxlength="3" size="3" /><span></span></div><div class="colorpicker_hsb_s colorpicker_field"><input type="text" maxlength="3" size="3" /><span></span></div><div class="colorpicker_hsb_b colorpicker_field"><input type="text" maxlength="3" size="3" /><span></span></div><div class="colorpicker_submit"></div></div>',
			defaults = {
				eventName: 'click',
				onShow: function () {},
				onBeforeShow: function(){},
				onHide: function () {},
				onChange: function () {},
				onSubmit: function () {},
				onRestore: function () {},
				color: 'ff0000',
				livePreview: true,
				flat: false,
				stopNextShow: false
			},
			fillRGBFields = function  (hsb, cal) {
				var rgb = HSBToRGB(hsb);
				$(cal).data('colorpicker').fields
					.eq(1).val(rgb.r).end()
					.eq(2).val(rgb.g).end()
					.eq(3).val(rgb.b).end();
			},
			fillHSBFields = function  (hsb, cal) {
				$(cal).data('colorpicker').fields
					.eq(4).val(hsb.h).end()
					.eq(5).val(hsb.s).end()
					.eq(6).val(hsb.b).end();
			},
			fillHexFields = function (hsb, cal) {
				$(cal).data('colorpicker').fields
					.eq(0).val(HSBToHex(hsb)).end();
			},
			setSelector = function (hsb, cal) {
				$(cal).data('colorpicker').selector.css('backgroundColor', '#' + HSBToHex({h: hsb.h, s: 100, b: 100}));
				$(cal).data('colorpicker').selectorIndic.css({
					left: parseInt(150 * hsb.s/100, 10),
					top: parseInt(150 * (100-hsb.b)/100, 10)
				});
			},
			setHue = function (hsb, cal) {
				$(cal).data('colorpicker').hue.css('top', parseInt(150 - 150 * hsb.h/360, 10));
			},
			setCurrentColor = function (hsb, cal) {
				$(cal).data('colorpicker').currentColor.css('backgroundColor', '#' + HSBToHex(hsb));
			},
			setNewColor = function (hsb, cal) {
				$(cal).data('colorpicker').newColor.css('backgroundColor', '#' + HSBToHex(hsb));
			},
			keyDown = function (ev) {
				var pressedKey = ev.charCode || ev.keyCode || -1;
				if ((pressedKey > charMin && pressedKey <= 90) || pressedKey == 32) {
					return false;
				}
				var cal = $(this).parent().parent();
				if (cal.data('colorpicker').livePreview === true) {
					change.apply(this);
				}
			},
			change = function (ev) {
				var cal = $(this).parent().parent(), col;
				if (this.parentNode.className.indexOf('_hex') > 0) {
					cal.data('colorpicker').color = col = HexToHSB(fixHex(this.value));
				} else if (this.parentNode.className.indexOf('_hsb') > 0) {
					cal.data('colorpicker').color = col = fixHSB({
						h: parseInt(cal.data('colorpicker').fields.eq(4).val(), 10),
						s: parseInt(cal.data('colorpicker').fields.eq(5).val(), 10),
						b: parseInt(cal.data('colorpicker').fields.eq(6).val(), 10)
					});
				} else {
					cal.data('colorpicker').color = col = RGBToHSB(fixRGB({
						r: parseInt(cal.data('colorpicker').fields.eq(1).val(), 10),
						g: parseInt(cal.data('colorpicker').fields.eq(2).val(), 10),
						b: parseInt(cal.data('colorpicker').fields.eq(3).val(), 10)
					}));
				}
				if (ev) {
					fillRGBFields(col, cal.get(0));
					fillHexFields(col, cal.get(0));
					fillHSBFields(col, cal.get(0));
				}
				setSelector(col, cal.get(0));
				setHue(col, cal.get(0));
				setNewColor(col, cal.get(0));
				cal.data('colorpicker').onChange.apply(cal, [col, HSBToHex(col), HSBToRGB(col)]);
			},
			blur = function (ev) {
				var cal = $(this).parent().parent();
				cal.data('colorpicker').fields.parent().removeClass('colorpicker_focus');
			},
			focus = function () {
				charMin = this.parentNode.className.indexOf('_hex') > 0 ? 70 : 65;
				$(this).parent().parent().data('colorpicker').fields.parent().removeClass('colorpicker_focus');
				$(this).parent().addClass('colorpicker_focus');
			},
			downIncrement = function (ev) {
				ev.preventDefault();
				var field = $(this).parent().find('input').focus();
				var current = {
					el: $(this).parent().addClass('colorpicker_slider'),
					max: this.parentNode.className.indexOf('_hsb_h') > 0 ? 360 : (this.parentNode.className.indexOf('_hsb') > 0 ? 100 : 255),
					y: ev.pageY,
					field: field,
					val: parseInt(field.val(), 10),
					preview: $(this).parent().parent().data('colorpicker').livePreview					
				};
				$(document).bind('mouseup', current, upIncrement);
				$(document).bind('mousemove', current, moveIncrement);
			},
			moveIncrement = function (ev) {
				ev.data.field.val(Math.max(0, Math.min(ev.data.max, parseInt(ev.data.val + ev.pageY - ev.data.y, 10))));
				if (ev.data.preview) {
					change.apply(ev.data.field.get(0), [true]);
				}
				return false;
			},
			upIncrement = function (ev) {
				change.apply(ev.data.field.get(0), [true]);
				ev.data.el.removeClass('colorpicker_slider').find('input').focus();
				$(document).unbind('mouseup', upIncrement);
				$(document).unbind('mousemove', moveIncrement);
				return false;
			},
			downHue = function (ev) {
				ev.preventDefault();
				var current = {
					cal: $(this).parent(),
					y: $(this).offset().top
				};
				current.preview = current.cal.data('colorpicker').livePreview;
				//cam
				ev.data=current;
				moveHue(ev);
				$(document).bind('mouseup', current, upHue);
				$(document).bind('mousemove', current, moveHue);
			},
			moveHue = function (ev) {
				change.apply(
					ev.data.cal.data('colorpicker')
						.fields
						.eq(4)
						.val(parseInt(360*(150 - Math.max(0,Math.min(150,(ev.pageY - ev.data.y))))/150, 10))
						.get(0),
					[ev.data.preview]
				);
				return false;
			},
			upHue = function (ev) {
				fillRGBFields(ev.data.cal.data('colorpicker').color, ev.data.cal.get(0));
				fillHexFields(ev.data.cal.data('colorpicker').color, ev.data.cal.get(0));
				$(document).unbind('mouseup', upHue);
				$(document).unbind('mousemove', moveHue);
				return false;
			},
			downSelector = function (ev) {
				var current = {
					cal: $(this).parent(),
					pos: $(this).offset()
				};
				current.preview = current.cal.data('colorpicker').livePreview;
				ev.data = current;
				moveSelector(ev);

				$(document).bind('mouseup', current, upSelector);
				$(document).bind('mousemove', current, moveSelector);
			},
			moveSelector = function (ev) {
				change.apply(
					ev.data.cal.data('colorpicker')
						.fields
						.eq(6)
						.val(parseInt(100*(150 - Math.max(0,Math.min(150,(ev.pageY - ev.data.pos.top))))/150, 10))
						.end()
						.eq(5)
						.val(parseInt(100*(Math.max(0,Math.min(150,(ev.pageX - ev.data.pos.left))))/150, 10))
						.get(0),
					[ev.data.preview]
				);
				return false;
			},
			upSelector = function (ev) {
				fillRGBFields(ev.data.cal.data('colorpicker').color, ev.data.cal.get(0));
				fillHexFields(ev.data.cal.data('colorpicker').color, ev.data.cal.get(0));
				$(document).unbind('mouseup', upSelector);
				$(document).unbind('mousemove', moveSelector);
				return false;
			},
			enterSubmit = function (ev) {
				$(this).addClass('colorpicker_focus');
			},
			leaveSubmit = function (ev) {
				$(this).removeClass('colorpicker_focus');
			},
			clickSubmit = function (ev) {
				var cal = $(this).parent();
				var col = cal.data('colorpicker').color;
				cal.data('colorpicker').origColor = col;
				setCurrentColor(col, cal.get(0));
				cal.data('colorpicker').onSubmit(col, HSBToHex(col), HSBToRGB(col), cal.data('colorpicker').el);
			},
			show = function (ev) {
				var cal = $('#' + $(this).data('colorpickerId'));
				cal.data('colorpicker').source=ev.target;
				if (cal.data('colorpicker').stopNextShow==true) {
					cal.data('colorpicker').stopNextShow=false;
					return;
				}
				cal.data('colorpicker').onBeforeShow.apply(this, [cal.get(0)]);
				var pos = $(this).offset();
				var viewPort = getViewport();
				var top = pos.top + this.offsetHeight;
				var left = pos.left;
				if (top + 176 > viewPort.t + viewPort.h) {
					top -= this.offsetHeight + 176;
				}
				if (left + 356 > viewPort.l + viewPort.w) {
					left -= 356;
				}
				cal.css({left: left + 'px', top: top + 'px'});
				if (cal.data('colorpicker').onShow.apply(this, [cal.get(0)]) != false) {
					cal.show();
				}
				$(document).bind('mousedown', {cal: cal}, hide);
				return false;
			},
			hide = function (ev) {
				ev.preventDefault();
				if (ev.data.cal.data('colorpicker').source == ev.target) {
					ev.data.cal.data('colorpicker').stopNextShow = true;
				}
				if (!isChildOf(ev.data.cal.get(0), ev.target, ev.data.cal.get(0))) {
					if (ev.data.cal.data('colorpicker').onHide.apply(this, [ev.data.cal.get(0)]) != false) {
						ev.data.cal.hide();
					}
					$(document).unbind('mousedown', hide);
				}
			},
			isChildOf = function(parentEl, el, container) {
				if (parentEl == el) {
					return true;
				}
				if (parentEl.contains) {
					return parentEl.contains(el);
				}
				if ( parentEl.compareDocumentPosition ) {
					return !!(parentEl.compareDocumentPosition(el) & 16);
				}
				var prEl = el.parentNode;
				while(prEl && prEl != container) {
					if (prEl == parentEl)
						return true;
					prEl = prEl.parentNode;
				}
				return false;
			},
			getViewport = function () {
				var m = document.compatMode == 'CSS1Compat';
				return {
					l : window.pageXOffset || (m ? document.documentElement.scrollLeft : document.body.scrollLeft),
					t : window.pageYOffset || (m ? document.documentElement.scrollTop : document.body.scrollTop),
					w : window.innerWidth || (m ? document.documentElement.clientWidth : document.body.clientWidth),
					h : window.innerHeight || (m ? document.documentElement.clientHeight : document.body.clientHeight)
				};
			},
			fixHSB = function (hsb) {
				return {
					h: Math.min(360, Math.max(0, hsb.h)),
					s: Math.min(100, Math.max(0, hsb.s)),
					b: Math.min(100, Math.max(0, hsb.b))
				};
			}, 
			fixRGB = function (rgb) {
				return {
					r: Math.min(255, Math.max(0, rgb.r)),
					g: Math.min(255, Math.max(0, rgb.g)),
					b: Math.min(255, Math.max(0, rgb.b))
				};
			},
			fixHex = function (hex) {
				var len = 6 - hex.length;
				if (len > 0) {
					var o = [];
					for (var i=0; i<len; i++) {
						o.push('0');
					}
					o.push(hex);
					hex = o.join('');
				}
				return hex;
			}, 
			HexToRGB = function (hex) {
				var hex = parseInt(((hex.indexOf('#') > -1) ? hex.substring(1) : hex), 16);
				return {r: hex >> 16, g: (hex & 0x00FF00) >> 8, b: (hex & 0x0000FF)};
			},
			HexToHSB = function (hex) {
				return RGBToHSB(HexToRGB(hex));
			},
			RGBToHSB = function (rgb) {
				var hsb = {
					h: 0,
					s: 0,
					b: 0
				};
				var min = Math.min(rgb.r, rgb.g, rgb.b);
				var max = Math.max(rgb.r, rgb.g, rgb.b);
				var delta = max - min;
				hsb.b = max;
				//if (max != 0) {
					//
				//}
				hsb.s = max != 0 ? 255 * delta / max : 0;
				if (hsb.s != 0) {
					if (rgb.r == max) {
						hsb.h = (rgb.g - rgb.b) / delta;
					} else if (rgb.g == max) {
						hsb.h = 2 + (rgb.b - rgb.r) / delta;
					} else {
						hsb.h = 4 + (rgb.r - rgb.g) / delta;
					}
				} else {
					hsb.h = -1;
				}
				hsb.h *= 60;
				if (hsb.h < 0) {
					hsb.h += 360;
				}
				hsb.s *= 100/255;
				hsb.b *= 100/255;
                                if(rgb.r==rgb.g && rgb.r==rgb.b){
                                        hsb.h=237;
				}
				return hsb;
			},
			HSBToRGB = function (hsb) {
				var rgb = {};
				var h = Math.round(hsb.h);
				var s = Math.round(hsb.s*255/100);
				var v = Math.round(hsb.b*255/100);
				if(s == 0) {
					rgb.r = rgb.g = rgb.b = v;
				} else {
					var t1 = v;
					var t2 = (255-s)*v/255;
					var t3 = (t1-t2)*(h%60)/60;
					if(h==360) h = 0;
					if(h<60) {rgb.r=t1;	rgb.b=t2; rgb.g=t2+t3}
					else if(h<120) {rgb.g=t1; rgb.b=t2;	rgb.r=t1-t3}
					else if(h<180) {rgb.g=t1; rgb.r=t2;	rgb.b=t2+t3}
					else if(h<240) {rgb.b=t1; rgb.r=t2;	rgb.g=t1-t3}
					else if(h<300) {rgb.b=t1; rgb.g=t2;	rgb.r=t2+t3}
					else if(h<360) {rgb.r=t1; rgb.g=t2;	rgb.b=t1-t3}
					else {rgb.r=0; rgb.g=0;	rgb.b=0}
				}
				return {r:Math.round(rgb.r), g:Math.round(rgb.g), b:Math.round(rgb.b)};
			},
			RGBToHex = function (rgb) {
				var hex = [
					rgb.r.toString(16),
					rgb.g.toString(16),
					rgb.b.toString(16)
				];
				$.each(hex, function (nr, val) {
					if (val.length == 1) {
						hex[nr] = '0' + val;
					}
				});
				return hex.join('');
			},
			HSBToHex = function (hsb) {
				return RGBToHex(HSBToRGB(hsb));
			},
			restoreOriginal = function () {
				var cal = $(this).parent();
				var col = cal.data('colorpicker').origColor;
				cal.data('colorpicker').color = col;
				fillRGBFields(col, cal.get(0));
				fillHexFields(col, cal.get(0));
				fillHSBFields(col, cal.get(0));
				setSelector(col, cal.get(0));
				setHue(col, cal.get(0));
				setNewColor(col, cal.get(0));
				cal.data('colorpicker').onRestore.apply(cal, [col, HSBToHex(col), HSBToRGB(col)]);

			};
		return {
			init: function (opt) {
				opt = $.extend({}, defaults, opt||{});
				if (typeof opt.color == 'string') {
					opt.color = HexToHSB(opt.color);
				} else if (opt.color.r != undefined && opt.color.g != undefined && opt.color.b != undefined) {
					opt.color = RGBToHSB(opt.color);
				} else if (opt.color.h != undefined && opt.color.s != undefined && opt.color.b != undefined) {
					opt.color = fixHSB(opt.color);
				} else {
					return this;
				}
				return this.each(function () {
					if (!$(this).data('colorpickerId')) {
						var options = $.extend({}, opt);
						options.origColor = opt.color;
						var id = 'colorpicker_' + parseInt(Math.random() * 1000);
						$(this).data('colorpickerId', id);
						var cal = $(tpl).attr('id', id);
						if (options.flat) {
							cal.appendTo(this).show();
						} else {
							cal.appendTo(document.body);
						}
						options.fields = cal
											.find('input')
												.bind('keyup', keyDown)
												.bind('change', change)
												.bind('blur', blur)
												.bind('focus', focus);
						cal
							.find('span').bind('mousedown', downIncrement).end()
							.find('>div.colorpicker_current_color').bind('click', restoreOriginal);
						options.selector = cal.find('div.colorpicker_color').bind('mousedown', downSelector);
						options.selectorIndic = options.selector.find('div div');
						options.el = this;
						options.hue = cal.find('div.colorpicker_hue div');
						cal.find('div.colorpicker_hue').bind('mousedown', downHue);
						options.newColor = cal.find('div.colorpicker_new_color');
						options.currentColor = cal.find('div.colorpicker_current_color');
						cal.data('colorpicker', options);
						cal.find('div.colorpicker_submit')
							.bind('mouseenter', enterSubmit)
							.bind('mouseleave', leaveSubmit)
							.bind('click', clickSubmit);
						fillRGBFields(options.color, cal.get(0));
						fillHSBFields(options.color, cal.get(0));
						fillHexFields(options.color, cal.get(0));
						setHue(options.color, cal.get(0));
						setSelector(options.color, cal.get(0));
						setCurrentColor(options.color, cal.get(0));
						setNewColor(options.color, cal.get(0));
						if (options.flat) {
							cal.css({
								position: 'relative',
								display: 'block'
							});
						} else {
							$(this).bind(options.eventName, show);
						}
					}
				});
			},
			showPicker: function() {
				return this.each( function () {
					if ($(this).data('colorpickerId')) {
						show.apply(this);
					}
				});
			},
			hidePicker: function() {
				return this.each( function () {
					if ($(this).data('colorpickerId')) {
						$('#' + $(this).data('colorpickerId')).hide();
					}
				});
			},
			setColor: function(col) {
				if (typeof col == 'string') {
					col = HexToHSB(col);
				} else if (col.r != undefined && col.g != undefined && col.b != undefined) {
					col = RGBToHSB(col);
				} else if (col.h != undefined && col.s != undefined && col.b != undefined) {
					col = fixHSB(col);
				} else {
					return this;
				}
				return this.each(function(){
					if ($(this).data('colorpickerId')) {
						var cal = $('#' + $(this).data('colorpickerId'));
						cal.data('colorpicker').color = col;
						cal.data('colorpicker').origColor = col;
						fillRGBFields(col, cal.get(0));
						fillHSBFields(col, cal.get(0));
						fillHexFields(col, cal.get(0));
						setHue(col, cal.get(0));
						setSelector(col, cal.get(0));
						setCurrentColor(col, cal.get(0));
						setNewColor(col, cal.get(0));
					}
				});
			}
		};
	}();
	$.fn.extend({
		ColorPicker: ColorPicker.init,
		ColorPickerHide: ColorPicker.hidePicker,
		ColorPickerShow: ColorPicker.showPicker,
		ColorPickerSetColor: ColorPicker.setColor
	});
})(jQuery);

// hello

/**
 *
 * Zoomimage
 * Author: Stefan Petre www.eyecon.ro
 * 
 * @requires jquery
 * Modified: Cameron Gregory, http:/www.flamingtext.com/
 * 
 */
(function($){
	var EYE = window.EYE = function() {
		var _registered = {
			init: []
		};
		return {
			init: function() {
				$.each(_registered.init, function(nr, fn){
					fn.call();
				});
			},
			extend: function(prop) {
				for (var i in prop) {
					if (prop[i] != undefined) {
						this[i] = prop[i];
					}
				}
			},
			register: function(fn, type) {
				if (!_registered[type]) {
					_registered[type] = [];
				}
				_registered[type].push(fn);
			}
		};
	}();
	$(EYE.init);
})(jQuery);
/**
 *
 * Utilities
 * Author: Stefan Petre www.eyecon.ro
 * @requires jquery, EYE
 * 
 * Modified: Cameron Gregory, http:/www.flamingtext.com/
 */
(function($) {
EYE.extend({
	getPosition : function(e, forceIt)
	{
		var x = 0;
		var y = 0;
		var es = e.style;
		var restoreStyles = false;
		if (forceIt && jQuery.curCSS(e,'display') == 'none') {
			var oldVisibility = es.visibility;
			var oldPosition = es.position;
			restoreStyles = true;
			es.visibility = 'hidden';
			es.display = 'block';
			es.position = 'absolute';
		}
		var el = e;
		if (el.getBoundingClientRect) { // IE
			var box = el.getBoundingClientRect();
			x = box.left + Math.max(document.documentElement.scrollLeft, document.body.scrollLeft) - 2;
			y = box.top + Math.max(document.documentElement.scrollTop, document.body.scrollTop) - 2;
		} else {
			x = el.offsetLeft;
			y = el.offsetTop;
			el = el.offsetParent;
			if (e != el) {
				while (el) {
					x += el.offsetLeft;
					y += el.offsetTop;
					el = el.offsetParent;
				}
			}
			//Replace "jQuery.browser.safari" with "navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1" since jQuery.browser is deprecated in jquery1.9
			if (navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1 && jQuery.curCSS(e, 'position') == 'absolute' ) {
				x -= document.body.offsetLeft;
				y -= document.body.offsetTop;
			}
			el = e.parentNode;
			while (el && el.tagName.toUpperCase() != 'BODY' && el.tagName.toUpperCase() != 'HTML') 
			{
				if (jQuery.curCSS(el, 'display') != 'inline') {
					x -= el.scrollLeft;
					y -= el.scrollTop;
				}
				el = el.parentNode;
			}
		}
		if (restoreStyles == true) {
			es.display = 'none';
			es.position = oldPosition;
			es.visibility = oldVisibility;
		}
		return {x:x, y:y};
	},
	getSize : function(e)
	{
		var w = parseInt(jQuery.curCSS(e,'width'), 10);
		var h = parseInt(jQuery.curCSS(e,'height'), 10);
		var wb = 0;
		var hb = 0;
		if (jQuery.curCSS(e, 'display') != 'none') {
			wb = e.offsetWidth;
			hb = e.offsetHeight;
		} else {
			var es = e.style;
			var oldVisibility = es.visibility;
			var oldPosition = es.position;
			es.visibility = 'hidden';
			es.display = 'block';
			es.position = 'absolute';
			wb = e.offsetWidth;
			hb = e.offsetHeight;
			es.display = 'none';
			es.position = oldPosition;
			es.visibility = oldVisibility;
		}
		return {w:w, h:h, wb:wb, hb:hb};
	},
	getClient : function(e)
	{
		var h, w;
		if (e) {
			w = e.clientWidth;
			h = e.clientHeight;
		} else {
			var de = document.documentElement;
			w = window.innerWidth || self.innerWidth || (de&&de.clientWidth) || document.body.clientWidth;
			h = window.innerHeight || self.innerHeight || (de&&de.clientHeight) || document.body.clientHeight;
		}
		return {w:w,h:h};
	},
	getScroll : function (e)
	{
		var t=0, l=0, w=0, h=0, iw=0, ih=0;
		if (e && e.nodeName.toLowerCase() != 'body') {
			t = e.scrollTop;
			l = e.scrollLeft;
			w = e.scrollWidth;
			h = e.scrollHeight;
		} else  {
			if (document.documentElement) {
				t = document.documentElement.scrollTop;
				l = document.documentElement.scrollLeft;
				w = document.documentElement.scrollWidth;
				h = document.documentElement.scrollHeight;
			} else if (document.body) {
				t = document.body.scrollTop;
				l = document.body.scrollLeft;
				w = document.body.scrollWidth;
				h = document.body.scrollHeight;
			}
			if (typeof pageYOffset != 'undefined') {
				t = pageYOffset;
				l = pageXOffset;
			}
			iw = self.innerWidth||document.documentElement.clientWidth||document.body.clientWidth||0;
			ih = self.innerHeight||document.documentElement.clientHeight||document.body.clientHeight||0;
		}
		return { t: t, l: l, w: w, h: h, iw: iw, ih: ih };
	},
	getMargins : function(e, toInteger)
	{
		var t = jQuery.curCSS(e,'marginTop') || '';
		var r = jQuery.curCSS(e,'marginRight') || '';
		var b = jQuery.curCSS(e,'marginBottom') || '';
		var l = jQuery.curCSS(e,'marginLeft') || '';
		if (toInteger)
			return {
				t: parseInt(t, 10)||0,
				r: parseInt(r, 10)||0,
				b: parseInt(b, 10)||0,
				l: parseInt(l, 10)
			};
		else
			return {t: t, r: r,	b: b, l: l};
	},
	getPadding : function(e, toInteger)
	{
		var t = jQuery.curCSS(e,'paddingTop') || '';
		var r = jQuery.curCSS(e,'paddingRight') || '';
		var b = jQuery.curCSS(e,'paddingBottom') || '';
		var l = jQuery.curCSS(e,'paddingLeft') || '';
		if (toInteger)
			return {
				t: parseInt(t, 10)||0,
				r: parseInt(r, 10)||0,
				b: parseInt(b, 10)||0,
				l: parseInt(l, 10)
			};
		else
			return {t: t, r: r,	b: b, l: l};
	},
	getBorder : function(e, toInteger)
	{
		var t = jQuery.curCSS(e,'borderTopWidth') || '';
		var r = jQuery.curCSS(e,'borderRightWidth') || '';
		var b = jQuery.curCSS(e,'borderBottomWidth') || '';
		var l = jQuery.curCSS(e,'borderLeftWidth') || '';
		if (toInteger)
			return {
				t: parseInt(t, 10)||0,
				r: parseInt(r, 10)||0,
				b: parseInt(b, 10)||0,
				l: parseInt(l, 10)||0
			};
		else
			return {t: t, r: r,	b: b, l: l};
	},
	traverseDOM : function(nodeEl, func)
	{
		func(nodeEl);
		nodeEl = nodeEl.firstChild;
		while(nodeEl){
			EYE.traverseDOM(nodeEl, func);
			nodeEl = nodeEl.nextSibling;
		}
	},
	getInnerWidth :  function(el, scroll) {
		var offsetW = el.offsetWidth;
		return scroll ? Math.max(el.scrollWidth,offsetW) - offsetW + el.clientWidth:el.clientWidth;
	},
	getInnerHeight : function(el, scroll) {
		var offsetH = el.offsetHeight;
		return scroll ? Math.max(el.scrollHeight,offsetH) - offsetH + el.clientHeight:el.clientHeight;
	},
	getExtraWidth : function(el) {
		if($.boxModel)
			return (parseInt($.curCSS(el, 'paddingLeft'))||0)
				+ (parseInt($.curCSS(el, 'paddingRight'))||0)
				+ (parseInt($.curCSS(el, 'borderLeftWidth'))||0)
				+ (parseInt($.curCSS(el, 'borderRightWidth'))||0);
		return 0;
	},
	getExtraHeight : function(el) {
		if($.boxModel)
			return (parseInt($.curCSS(el, 'paddingTop'))||0)
				+ (parseInt($.curCSS(el, 'paddingBottom'))||0)
				+ (parseInt($.curCSS(el, 'borderTopWidth'))||0)
				+ (parseInt($.curCSS(el, 'borderBottomWidth'))||0);
		return 0;
	},
	isChildOf: function(parentEl, el, container) {
		if (parentEl == el) {
			return true;
		}
		if (!el || !el.nodeType || el.nodeType != 1) {
			return false;
		}
		if (parentEl.contains && !(navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1)) {
			return parentEl.contains(el);
		}
		if ( parentEl.compareDocumentPosition ) {
			return !!(parentEl.compareDocumentPosition(el) & 16);
		}
		var prEl = el.parentNode;
		while(prEl && prEl != container) {
			if (prEl == parentEl)
				return true;
			prEl = prEl.parentNode;
		}
		return false;
	},
	centerEl : function(el, axis)
	{
		var clientScroll = EYE.getScroll();
		var size = EYE.getSize(el);
		if (!axis || axis == 'vertically')
			$(el).css(
				{
					top: clientScroll.t + ((Math.min(clientScroll.h,clientScroll.ih) - size.hb)/2) + 'px'
				}
			);
		if (!axis || axis == 'horizontally')
			$(el).css(
				{
					left: clientScroll.l + ((Math.min(clientScroll.w,clientScroll.iw) - size.wb)/2) + 'px'
				}
			);
	}
});
if (!$.easing.easeout) {
	$.easing.easeout = function(p, n, firstNum, delta, duration) {
		return -delta * ((n=n/duration-1)*n*n*n - 1) + firstNum;
	};
}
	
})(jQuery);
(function($){
	getImageCache = function(script){
		var cache = false;
		var pos = window.location.search.indexOf("imageCache=");
		if(pos!=-1){
			var val = window.location.search.substring(pos+11);
			var ampersand = val.indexOf('&');
			if(ampersand != -1){
				val = val.substring(0,ampersand);
			}
			if(val=="true")
				return true;
			return false;
		}
		var logos = ['aurora-logo'
			,'bad-oil-logo'
			,'burnt-paper-logo'
			,'chalk-logo'
			,'chip-away-logo'
			,'chrominium-logo'
			,'colored-logo'
			,'dracula-logo'
			,'electricity-logo'
			,'feurio-logo'
			,'fire-logo'
			,'flammen-logo'
			,'flash-fire-logo'
			,'frosty-logo'
			,'gas-flame-logo'
			,'harry-potter-logo'
			,'ice-logo'
			,'ice-cube-logo'
			,'ice-fire-logo'
			,'lava-logo'
			,'liquid-water-logo'
			,'molten-logo'
			,'mosaic-logo'
			,'mud-logo'
			,'oil-spill-logo'
			,'old-photo-logo'
			,'old-stone-logo'
			,'plasma-logo'
			,'slime-logo'
			,'smokey-logo'
			,'solid-noise-logo'
			,'sound-blast-logo'
			,'star-wars-logo'
			,'starburst-logo'
			,'starscape-logo'
			,'textured-logo'
			,'warp-logo'
			,'watercolor-logo'
		];
		var re = new RegExp(logos.join("|"));

		if(script && !script.match(re))
			cache = true;
		return cache;
	};


	//AnimPreset widget
	$.widget( "ui.animPreset", {
		options: {
			value: "none"
			,frameControlID: "frameControl"
			,idPrepend: "1-frame"
			,maxFrames:20
		},
		
		_create: function() {
			var o = this.options;
			this.frameControl = $("#"+o.frameControlID).frameControl();
			this.value = this.widget().val() || o.value;
			
			var preset = this.value;
				switch (preset){
					case "letters":
						this._letters();break;
					case "letterSpacing":
						this._letterSpacing();break;
					case "letterRotate": //need around 50 frames for good looking rotation
						this._letterRotate();break;
					case "shake":
						this._shake();break;
					case "shadowOpacity":
						this._shadowOpacity();break;
					case "flashFire":
						this._flashFire();break;
					case "movingStripes":
						this._movingStripes();break;
					case "bounce":
						this._bounce();break;
					case "randomPreset":
						this._randomPreset();break;
					case "tileSizeIncrease":
						this._tileSizeIncrease();break;
					case "tileSizeDecrease":
						this._tileSizeDecrease();break;
					case "iceCube":
						this._iceCube();break;
					case "burntPaper":
						this._burntPaper();break;
					case "amazing3d":
						this._amazing3d();break;
					case "none":
						break;
				};
			//refresh frameControl
			this._initImageCache();
			this.frameControl.frameControl();
		},
		_initImageCache:function(){
			var script = $("#"+this.options.idPrepend+"0_script").val();
			var cache = getImageCache(script);
			$("#1-imageCache").prop("checked", cache);
		},
		_letters: function(){
			var o = this.options;
			$("#"+o.idPrepend+"0_text").paramGenerator({
				numFrames: "length"
				,fn: function(ev, ui){
					var initValue = ui.val;
					var lettersPerFrame = Math.ceil(initValue.length/ui.frames);
					var excess = lettersPerFrame*ui.frames - initValue.length;
					var cutDownMultiple = Math.floor(ui.frames/excess);
					//ui.frames = 
					var prevEnd=0;
					for (var i=0; i<ui.frames; i++){
						var letters = lettersPerFrame;
						if(excess && i%cutDownMultiple == 0){
							letters--;
							excess--;
						}
						var end = prevEnd = prevEnd+letters;
						end = end <initValue.length? end: initValue.length;
						//var end = (i+1)*letters <initValue.length? (i+1)*letters : initValue.length;						
						$("#"+o.idPrepend+i+"_"+ui.param).val(initValue.substring(0,end));
						
					}
				}
				,maxFrames: this.options.maxFrames
			});
		
		},
		_letterSpacing: function(){
			var o = this.options;
			$("#"+o.idPrepend+"0_letterSpacing").paramGenerator({
				numFrames: 10
				,fn: function(ev, ui){
					var initValue = -35;
					var multiple=5;
					for (var i=0; i<ui.frames; i++){
						var val  = initValue + i*multiple;
						$("#"+o.idPrepend+i+"_"+ui.param).val(val);
					}
				}
				,maxFrames: this.options.maxFrames
			});
		
		},
		_letterRotate: function(){
			var getRadian = function getRadian(deg) {
				return Math.PI * deg / 180;
			}
			var o = this.options;
			$("#"+o.idPrepend+"0_letterSpacing").paramGenerator({
				numFrames: 20 //need around 20 for better animation
				,fn: function(ev, ui){
					var reversed = -80;
					var rotateTotalAngle = 180;//can change this to 360, but really need more frames for this to look better
					
					var rotateFrameAngle = rotateTotalAngle/ui.frames;
					for (var i=0; i<ui.frames; i++){
						var a = getRadian(i*rotateFrameAngle);
						var val = Math.round(reversed*Math.sin(a))+8; //round for 'cleaner' user view.
						$("#"+o.idPrepend+i+"_"+ui.param).val(val);
					}
				}
				,maxFrames: this.options.maxFrames
			});
		
		},


		_shake: function(){
			
		},
		_shadowOpacity: function(){
			var o = this.options;
			$("#"+o.idPrepend+"0_shadowOpacity").paramGenerator({
				numFrames: 10 
				,fn: function(ev, ui){
					var minOpacity = 0, maxOpacity=100;
					var range = maxOpacity-minOpacity;
					var increment = range/ui.frames;
					for (var i=0; i<ui.frames; i++){
						var val = i*increment;
						$("#"+o.idPrepend+i+"_shadowType1").trigger('click');//prop('checked',true);
						$("#"+o.idPrepend+i+"_"+ui.param).val(val);
					}
				}
				,maxFrames: this.options.maxFrames
			});
		},
		_flashFire: function(){
			var o = this.options;
			$("#"+o.idPrepend+"0_spread").paramGenerator({
				numFrames: 10 
				,fn: function(ev, ui){
					var minSpread = 0.5, maxSpread=9.5;
					var range = maxSpread-minSpread;
					var increment = range/(ui.frames-1);
					for (var i=0; i<ui.frames; i++){
						var val = minSpread + i*increment;
						$("#"+o.idPrepend+i+"_"+ui.param).val(val);
					}
				}
				,maxFrames: this.options.maxFrames
			});
		},
		_movingStripes: function(){
			var o = this.options;
			var self = this;
			$("#"+o.idPrepend+"0_x1").paramGenerator({
				numFrames: 4
				,fn: function(ev, ui){
					startX1 = parseInt($("#"+o.idPrepend+0+"_"+"x1").val());
					startY1 = parseInt($("#"+o.idPrepend+0+"_"+"y1").val());

					//log("startX: "+startX1+", startY1: "+startY1);
					startX2 = parseInt($("#"+o.idPrepend+0+"_"+"x2").val());
					startY2 = parseInt($("#"+o.idPrepend+0+"_"+"y2").val());
			
					for (var i=0; i<ui.frames; i++){
						$("#"+o.idPrepend+i+"_"+"gtype").val(0);
						$("#"+o.idPrepend+i+"_"+"grepeat").val(2);

						self._setVal(ui.frames,i,"x1",startX1,2*(startX2-startX1));
						self._setVal(ui.frames,i,"y1",startY1,2*(startY2-startY1));
						self._setVal(ui.frames,i,"x2",startX2,startX2+2*(startX2-startX1));
						self._setVal(ui.frames,i,"y2",startY2,startY2+2*(startY2-startY1));
					}
					//$("#"+o.idPrepend+"6_msSleep").val(800);
				}
				,maxFrames: this.options.maxFrames
			});
		}
		,_bounce: function(){
			
		}
		,_randomPreset: function(){
			$("#totalFrames").val(5);
		}
		,_tileSizeIncrease:function(){
			var o = this.options;
			$("#"+o.idPrepend+"0_tileSize").paramGenerator({
				numFrames: 15
				,fn: function(ev, ui){
					var minSize = 1, maxSize=50;
					var range = maxSize-minSize;
					var increment = Math.floor(range/ui.frames);
					for (var i=0; i<ui.frames; i++){
						var val = (i+1)*increment;
						$("#"+o.idPrepend+i+"_"+ui.param).val(val);
						$("#"+o.idPrepend+i+"_fontsize").val(130);
					}
				}
				,maxFrames: this.options.maxFrames
			});
		}
		,_tileSizeDecrease:function(){
			var o = this.options;
			$("#"+o.idPrepend+"0_tileSize").paramGenerator({
				numFrames: 15
				,fn: function(ev, ui){
					var minSize = 1, maxSize=50;
					var range = maxSize-minSize;
					var increment = Math.floor(range/ui.frames);
					for (var i=0; i<ui.frames; i++){
						var val = (ui.frames-i)*increment;
						$("#"+o.idPrepend+i+"_"+ui.param).val(val);
						$("#"+o.idPrepend+i+"_fontsize").val(130);
					}
				}
				,maxFrames: this.options.maxFrames
			});
		}
		,_iceCube:function(){
			var o = this.options;
			$("#"+o.idPrepend+"0_growEffect").paramGenerator({
				numFrames: 15
				,fn: function(ev, ui){
					var minSize = -8, maxSize=12;
					var range = maxSize-minSize;
					var increment = 2;//Math.floor(range/ui.frames);
					for (var i=0; i<12; i++){
						var val = minSize+i*increment;
						if(val>maxSize)
							val=maxSize;
						$("#"+o.idPrepend+i+"_"+ui.param).val(val);
					}
					for (var i=0; i<12; i++){
						var val =0;
						if(i>6)
							val=i-6;
						$("#"+o.idPrepend+i+"_icicle").val(val);
					}
					//13
					$("#"+o.idPrepend+"12_growEffect").val(2);
					$("#"+o.idPrepend+"12_cubeDim").val(24);
					//14
					$("#"+o.idPrepend+"13_growEffect").val(-3);
					$("#"+o.idPrepend+"13_cubeDim").val(40);
					//15
					$("#"+o.idPrepend+"14_growEffect").val(-9);
					$("#"+o.idPrepend+"14_cubeDim").val(1);
					
					for (var i=0; i<ui.frames; i++){
						$("#"+o.idPrepend+i+"_fontsize").val(95);
						$("#"+o.idPrepend+i+"_fontname").val("victoriassecret").trigger('change');
						if(i>11)
							$("#"+o.idPrepend+i+"_icicle").val(5);
					}

				}
				,maxFrames: this.options.maxFrames
			});
		}
		,_burntPaper:function(){
			var o = this.options;
			var self = this;
			$("#"+o.idPrepend+"0_burnSize").paramGenerator({
				numFrames: 10
				,fn: function(ev, ui){
					for (var i=0; i<ui.frames; i++){
						self._setVal(ui.frames,i,"burnSize",0,100);
						self._setVal(ui.frames,i,"growSelection",24,0);
					}
				}
				,maxFrames: this.options.maxFrames
			});
		}
		,_amazing3d:function(){
			var o = this.options;
			var self = this;
			$("#"+o.idPrepend+"0_height").paramGenerator({
				numFrames: 7
				,fn: function(ev, ui){
					for (var i=0; i<ui.frames; i++){
						self._setVal(ui.frames,i,"height",60,3);
						self._setVal(ui.frames,i,"rotation",-45,-5);
						self._setVal(ui.frames,i,"shadowYOffset",2,20);
						self._setVal(ui.frames,i,"colorCenterR",32,0);
						self._setVal(ui.frames,i,"colorCenterG",65,0);
						self._setVal(ui.frames,i,"colorCenterB",94,0);
						self._setVal(ui.frames,i,"lineSpacing",-65,-11);
						$("#"+o.idPrepend+i+"_fontname_tagname").val("M").trigger('change');
						$("#"+o.idPrepend+i+"_fontname").val("Mixed up").trigger('change');
					}
					$("#"+o.idPrepend+"6_msSleep").val(800);
				}
				,maxFrames: this.options.maxFrames
			});
		}
		,_setVal:function(frames,i,param,start,end){
			var o = this.options;
			
			var range = Math.abs(start - end);
			var increment = Math.floor(range/(frames-1)) * i;
			
			var increase = end>start;
			if(!increase)
				increment = -increment;
			val = end - increment;
			$("#"+o.idPrepend+(frames-i-1)+"_"+param).val(val).trigger('change');
		}
	});
	
	/*use this to generate values for a given field
	numFrames  - required
	fn - function specifying how to generate values for this field over numFrames
	values - object to specify values directly for specific frames
	
	NOTE: 
	- fn is optional, so can generate values using values object
	- values is optional, ie dont have to use it(can use just fn)
	- if both are specified
		fn is run first
		values override
	
	eg:
		$("[id$=frame0_text]").paramGenerator({
				numFrames: "length" //can specify number or string "length"
				,fn: function(ev, ui){
					//available values:
					//ui.frames - same as numFrames
					//ui.param - field, eg "text"
					//ui.val - original value of the element
					
					var initValue = ui.val;
					for (var i=0; i<ui.frames; i++){
						$("[id$=frame"+i+"_"+ui.param+"]").val(initValue.substring(0,i+1));
					}
				}
				,values: { //object to override particular frames
					frame1: "override"
					,frame3: "too"
				}
			});
	
	*/
	$.widget( "ui.paramGenerator", {
		options: {
			param: null	//eg fontsize
			,numFrames: 1 //can be number or string "length" (useful when generating values based on lenght of the parameter)
			,fn: null //
			,values: null //eg {frame0:1,frame5:14}
			,totalFramesID : 'totalFrames'
			,maxFrames:20
		},
		
		_create: function() {
			var self = this;
			var o = this.options;
			self._initVars();
			
			if ($.isFunction(this.options.fn)){
				self._trigger('fn', null, self._ui());
			}
			self._populateValues();
		},
		_initVars: function(){
			var id = this.widget().attr("id");
			var field = id.match(new RegExp("_(.*)$"));			
			this.param = field.pop() || this.options.param; //can come from option
			
			this.totalFrames = $("#"+this.options.totalFramesID);
			this.value = this.widget().val();
			this._numFrames();
		},
		_numFrames: function(){
			var x = this.options.numFrames;
			if (typeof x == "number"){
				this.frames = x<=this.options.maxFrames ? x : this.options.maxFrames;;
			}
			else if(typeof x == "string"){
				if(x === "length"){
					this.frames = this.value.length<=this.options.maxFrames ? this.value.length : this.options.maxFrames;
				}
			}
			
			this.totalFrames.val(this.frames);
		},
		
		_ui: function(){
			return {
				frames: this.frames
				,param: this.param
				,val: this.value
			};		
		},
		_populateValues: function(){
			var v = this.options.values;
			var param = this.param;
			if(v==null){
				//not specified, do nothing
			}
			else if( $.isPlainObject(v) ){
				$.each(v, function(key, value) {
					$("[id$="+key+"_"+param+"]").val(value);
				});
			}
			else{
				//error, TODO: handle
			}
		}
		
	});

	//AnimPreset widget
	$.widget( "ui.animPresetController", {
		options: {
			img: "<img src=\"http://cdn1.ftimg.com/images/animate.png\" alt=\"Animate\" title=\"Animate\">"
			,animatorCgi: "/logo/animate.cgi" // usually overridden in dynamic.c
			,animPresets: {
				animate:{ui:"Animate",avail:true}
				,letters:{ui:"Type Letters",avail:false}
				,letterSpacing:{ui:"Moving Letters", avail: false}
				,letterRotate:{ui:"Rotating Letters", avail: false}
				,shadowOpacity:{ui:"Shadow Opacity", avail: false}
				,flashFire:{ui:"Flash Fire", avail: false}
				,movingStripes:{ui:"Moving Stripes", avail: false}
				//,randomPreset:{ui:"Random", avail: false, imageCache: false}
				,tileSizeIncrease:{ui:"Increasing Tile Size", avail: false}
				,tileSizeDecrease:{ui:"Decreasing Tile Size", avail: false}
				,iceCube:{ui:"Ice Cube", avail: false}
				,burntPaper:{ui:"Burning Paper", avail: false}
				,amazing3d:{ui:"Turning 3D", avail: false}
			}
			,idPrefix:"1-frame0_"
			,isPremium:false
		},
		_create: function() {
			var self = this;
			this.widget().html($(this.options.img));
			this.button = this.widget().children().eq(0);
			
			//var inputs = $(':input');//so that we can re-use this(faster)
			//var hidden = $(':hidden');
			
			this.animPresets = this.options.animPresets;
			this._setContext();
			this._enablePresets();
			this._buildUI();
			this._handleClick();
			
		},
		_setContext:function(){
			this.context = undefined;
			var prefix = this.options.idPrefix;
			if(prefix.charAt(prefix.length-1)=="_")
				prefix = prefix.substring(0,prefix.length-1);
			this.context = $("#"+prefix);
			this.animateMode = true;
			if(!this.context.length){
				this.animateMode = false;
				this.context=this.widget().closest("form");//we allow this to be on first frame of animator
			}
		},
		_buildUI:function(){
			this.preview = $("<div class=\"animPresetControllerPreview\"></div>").appendTo('body');
			//this.preview = $("<div class=\"animPresetControllerPreview\"></div>").appendTo(this.widget());
			this.preview.css("left","-1000px");
			
			this.list = $("<ul></ul>").appendTo(this.preview);
			var self = this;
			
			var liWidth=0;
			$.each(this.animPresets, function(k,v){
				if(v.avail){
					var li =  $("<li presetValue=\""+k+"\"></li>");
					//can add preview image here
					$("<div class=\"animPresetControllerTitle\">"+v.ui+"</div>").appendTo(li);
					//can add description here
					li.click(function(){
						var params = buildParams(self.context,{frame0_url:1},"frame\\d_");//method defined in dynamicform.js
						params = params + "animPreset="+encodeURIComponent($(this).attr('presetValue'));
						if("imageCache" in v && typeof v.imageCache=='boolean')
							params = params + "&imageCache="+(v.imageCache? "1":"0");
						//log(params);
						window.location.href = self.options.animatorCgi +'?'+params;
					});
					self.list.append(li);
					liWidth = (liWidth>li.outerWidth())?liWidth:li.outerWidth();
				}
			});
			this.preview.detach();
			this.preview.appendTo(this.widget());
			
			this.list.children().css('width',liWidth+"px");
			this.preview.css("left","-"+(liWidth-24)+"px");
		},
		_handleClick: function(){			
			var on_button=false;
			var self = this;
			
			this.button.bind('mousedown',function(e){
				e.preventDefault();
				if (!$(this).hasClass('down')) {
					$(this).addClass('down');
						self.preview.css({visibility:'visible'});//show();						
						on_button = true;
					} else {
						$(this).removeClass('down');
						self.preview.css({visibility:'hidden'});//hide();
					}
			}).hover(function() {
				on_button = true;
			}).mouseout(function() {
				on_button = false;
			});
			
			$(document).click(function(evt) {
				if(!on_button) {
					self.button.removeClass('down');
					self.preview.css({visibility:'hidden'});//hide();
				}
				on_button = false;
			});
		},
		_enablePresets: function(){
			var inputs = $(':input',this.context);
			var hidden = $(':hidden',this.context);
			this._setAvailable(this.animPresets.letters,inputs,"text");
			this._setAvailable(this.animPresets.letterSpacing,inputs,"letterSpacing");
			this._setAvailable(this.animPresets.letterRotate,inputs,"letterSpacing");
			this._setAvailable(this.animPresets.shadowOpacity,inputs,"shadowOpacity");

			this._setAvailable(this.animPresets.movingStripes,inputs,"x1");
			
			
			//this.animPresets.letters.avail = inputs.filter($("[id$=text]")).length>0;
			//this.animPresets.letterSpacing.avail = inputs.filter($("[id$=letterSpacing]")).length>0;
			//this.animPresets.letterRotate.avail = inputs.filter($("[id$=letterSpacing]")).length>0;
			//this.animPresets.shadowOpacity.avail = inputs.filter($("[id$=shadowOpacity]")).length>0;
			this.animPresets.flashFire.avail = this._equalScript("flash-fire-logo",hidden);
			//this.animPresets.movingStripes.avail = this._equalScript("candy-logo",hidden);
			this._enablePresetRandom();
			
			this._setAvailable(this.animPresets.tileSizeIncrease,inputs,"tileSize");
			this._setAvailable(this.animPresets.tileSizeDecrease,inputs,"tileSize");
			
			this.animPresets.iceCube.avail = this._equalScript("ice-cube-logo",hidden);
			this.animPresets.burntPaper.avail = this._equalScript("burnt-paper-logo",hidden);
			this.animPresets.amazing3d.avail = this._equalScript("amazing-3d-logo",hidden);
		},
		_equalScript:function(script,input){
			return !!(this.animateMode? (input.filter("#"+this.options.idPrefix+"script").val()==script)
								:
								(input.filter("[name=script]").val()==script));
		},
		_setAvailable:function(preset,context,field){
			var element = context.filter("#"+this.options.idPrefix+field);
			if(element.length){
				preset.avail = true;
				if(element.closest(".formEntry").hasClass("ftPremium") && !this.options.isPremium)
					preset.avail = false;
			}
		}
		,_enablePresetRandom: function(){
			if(!("randomPreset" in this.animPresets))
				return;
			var hidden = $(':hidden',this.context);
			var script = "";
			if(this.animateMode)
				script = hidden.filter("#"+this.options.idPrefix+"script").val();
			else
				script = hidden.filter("[name=script]").val();
			
			this.animPresets.randomPreset.avail = !getImageCache(script);
		}
	});

	
})(jQuery);
(function($){
	$(document).ready(function(){


		$(window).bind( 'hashchange', function(e) {
			var q = e.getState("q");
			var isFontSearchPage = window.location.pathname.indexOf("Font-Search") != -1;
			if(!isFontSearchPage)
				q = q || "";
			else if(typeof q == 'undefined'){
				q = getParameters()["q"];
			}
				

			//if we are on one of the font-search-enabled pages and there is no ft-font-content div, and q="" this means we backspaced our search, so lets reload the page to see the original.
			if(q=="" && $(".ft-font-search-content").length!=0 && $(".ft-font-content").length==0 && !isFontSearchPage)
				window.location.reload();

			//document.title = q + ' - Search fonts at FlamingText.com';
			if(typeof q != 'undefined') {
				var searchField = $(".ft-search-field.search_field");
				var focused = searchField.is(":focus");
				searchField.trigger('focus.hintedInput').val(q).trigger('change.fontSearch');
				if(!focused)
					searchField.trigger('blur.hintedInput');
			}
		});

		$(window).trigger( 'hashchange' );
	});


	//fontsearch widget
	$.widget( "ft.fontSearch", {
		options:{
			hint:{
				enabled:true
				,hintText:"Search fonts"
				,hintCss:{
					color:"#555"
				}
			}
			,initNumItems:0 //we need this if we just loaded search.jsp and have not run dynamic search yet(this will be used to update links when preview text changes)
		}
		,_create:function(){
			this._initHint();
			this._initQ();
			this._initEvents();
			this.cache = {};//save ajax results
			this.searchContent = $(".ft-font-search-content");
			if(this.searchContent.length ==0) 
				this.searchContent = $('<div class="ft-font-search-content"></div>').appendTo($(".ft-content-column"));//used for a div with search results
			
			this.numItems = this.options.initNumItems;
		}
		,_initQ: function(){
			var isFontSearchPage = window.location.pathname.indexOf("Font-Search") != -1;
			if(!isFontSearchPage)
				q = undefined;
			else
				q = getParameters()["q"];
			this.q = q;
		}
		,_initHint:function(){
			var o = this.options;
			if(!o.hint.enabled)
				return;
			$(this.element).hintedInput(o.hint);
		}
		,_initEvents:function(){
			var e = $(this.element);
			e.bind('change.fontSearch', {self:this},function(e){
				var self = e.data.self;
				var val = $(self).val();
				if(typeof self.q != 'undefined' && self.q == val)
					return;
				self.q = val;
				self.searchContent.empty();
				if(val==""){
					if(self.topPagination)
						self.topPagination.hide();
					else
						$(".ft-content-column .ft-font-filters").next(".ft-font-top-pagination").hide();
				}
				else
					self._searchFonts(val);
			});
			e.bind('keyup.fontSearch', {self:this}, function(e){
				var self = e.data.self;
				self.lastTimeKeyup = new Date().getTime();
				var val = $(self).val();
				var delay = 500;
				//its slow for 1-letter searches, so lets delay it more, ie we assume user will type more letters
				if(val.length<2)
					delay=1000;
				var checkFn = function(){
					var now = new Date().getTime();
					//log(self.lastTimeKeyup + ":" + now);
					var nextCheck = self.lastTimeKeyup +500 - now;
					if(nextCheck<0){
						$.bbq.pushState({"q":self._getVal()});
						$(self.element).trigger('change.fontSearch');
						//document.title = self._getVal() + ' - Search fonts at FlamingText.com';
					}
					else
						setTimeout(checkFn,nextCheck+100);
				};
				setTimeout(checkFn,delay);//to reduce number of calls
			});

			/*not used, /Jonas 18 April 2013
			$('.ft-font-preview-small').unbind('click.ft.font').bind('click.ft.font', function(e, force){
				if( (!$(this).hasClass('active')) || (force) ){
					$("#font_fontsize").val(20).trigger('change');
					$(this).siblings().removeClass('active');
					$(this).addClass('active');
					$(".ft-font-search-result-content").css("height", 36);
					$(".ft-font-search-result-content a > img").css("max-height", 36);
				}
			});
			$('.ft-font-preview-medium').unbind('click.ft.font').bind('click.ft.font', function(e, force){
				if( (!$(this).hasClass('active')) || (force) ){
					$("#font_fontsize").val(65).trigger('change');
					$(this).siblings().removeClass('active');
					$(this).addClass('active');
					$(".ft-font-search-result-content").css("height", 90);
					$(".ft-font-search-result-content a > img").css("max-height", 90);
				}
			});
			$('.ft-font-preview-large').unbind('click.ft.font').bind('click.ft.font', function(e, force){
				if( (!$(this).hasClass('active')) || (force) ){
					$("#font_fontsize").val(120).trigger('change');
					$(this).siblings().removeClass('active');
					$(this).addClass('active');
					$(".ft-font-search-result-content").css("height", 130);
					$(".ft-font-search-result-content a > img").css("max-height", 142);
				}
			});
			*/
			$("#font_text").bind("keyup keydown keypress",function(e){
				if(e.which == 13){
					e.stopImmediatePropagation();
					return false;
				}
			});
			$(".ft-content-column").children("form").bind('submit',{self:this},function(e){
				var val = $(e.data.self).val();
				if(val=="" && $(this).attr('action') !="")
					return false;
			});
/*
			$("#font_text, #font_script, #font_fontsize").bind("keyup.fontSearch change.fontSearch", {self:this},function(e){
				var self = e.data.self;
				var searchVal = $(self).val();
				if(searchVal){
					self._prepareTopPagination();
					self._updateTopPanel();
					self._updateBottomPanel();
				}
			});*/
		}
		/*dont use hintedInput /Jonas 18 April 2013
		,_getVal: function(){
			if(this.options.hint.enabled)
				return $(this.element).hintedInput("val");
			return $(this.element).val();
		}*/

		,_preparePage: function(){
			$(".ft-content-column .font-cat-nav-wide").remove();
			this._prepareLeftColumn();
			this._prepareTopPagination();

			$(".ft-font-content").remove();
			this.searchContent.empty();
		}
		,_prepareLeftColumn:function(){
			//replace authors with categories
			var authors = $(".ft-left-column .ft-font-authors");
			if(authors.length){
				authors.remove();
				var fontCatsColumn = $(".ft-content-column .font-cat-nav").not(".font-cat-nav-wide").detach();
				$(".ft-left-column").append(fontCatsColumn);
			}
		}
		,_prepareTopPagination:function(){
			//move topPagination, hide it
			//this.topPagination = $(".ft-content-column .ft-font-filters").next(".ft-font-top-pagination");
			this.topPagination = $(".ft-content-column .ft-font-filters").siblings(".ft-font-top-pagination");
			if(this.topPagination.length){
				this.topPagination.children().not(".ft-font-preview-input,.ft-font-controls").remove();
				this.topPagination.prepend('<h1 class="ft-font-search-header">Search results</h1>');
				//this.topPagination.insertAfter($(".ft-content-column .ft-font-filters"));
			}
			this.fontControls = $(".ft-font-controls",this.topPagination).hide();

			var topRightPagination = $(".ft-pagination",this.fontControls);
			var ul = $('ul',topRightPagination);
			if(!ul.length){
				ul = $('<ul><li><a href="">&gt;</a></li><li><a href="">&lt;</a></li></ul>').prependTo(topRightPagination);
				topRightPagination.find('span').css('position',"");
			}

			$(".ft-font-preview-input",this.topPagination).show();
			this.topPagination.hide();//it will be shown when processing results
		}
		,_restoreContent: function(){
			if($(".ft-search-content").length){
				this.searchContent = $(".ft-search-content").detach();
				this.originalContent.insertAfter($(".ft-content-column .ft-font-filters"));
			}
		}
		,_searchFonts: function(val){
			this._preparePage();
			this._doSearch(val);
		}
		,_doSearch: function(val){
			if(this._showCachedResults(val) || this.ajaxRunning)
				return;
			context = {self:this,val:val};
			this.ajaxRunning = true;
//.replace(/\ /gi,'+')
			var runningXhr = $.ajax({url:"/Ajax?c=fonts&t=all&q="+encodeURIComponent(val),async:true, context:context, cache:false, dataType:"json",
				success:function(result) {
					this.self.ajaxRunning = false;
					if (result.values) {
						this.self._saveItems(this.val,result.values);
						var latestSearch = $(this.self).val();
						//value changed while we got the results back
						if(latestSearch != this.val){
							this.self._doSearch(latestSearch);
						}
						else
							this.self._showCachedResults(this.val);
					} else if (result.error) {
						this.self._ajaxFailed(result.error, this.val);
					} else {
						this.self._ajaxFailed("bad response from server", this.val);
					}
				},
				error: function(req,textStatus) {
					this.self.ajaxRunning = false;
					this.self._ajaxFailed("http error:"+textStatus, this.val);
				}
			});
			
		}
		,_showCachedResults: function(key){
			var haveCache = false;
			if(key in this.cache){
				haveCache = true;
				var items = this.cache[key].items;
				this.numItems = items.length;
				this._updateTopPanel();
				this._showResults(items);
				this._updateBottomPanel();
				//this.searchContent.html(items.join(","));
				//var dom = this.cache[val].dom;
				//dom.insertAfter($(".ft-content-column .ft-font-filters"));
			}
			return haveCache;
		}
		,_saveItems: function(key, val){
			this.cache[key] = {
				items: val
				//,dom:this._buildSearchContent(val)
			};
		}
		,_ajaxFailed:function(err,searchTerm){
			// actually most of time, don't throw error, because it's just the person leaving the page.
			// figure out when we should log.
			//throw new Error(err + "; Search term:"+searchTerm);
		}
		,_updateTopPanel:function(){
			//$('.ft-font-search-header').text("Search results: \""+this._getVal()+"\"");
			var matchesString = " <span style='font-size:16px;font-weight:normal;'>("+this.numItems;
			matchesString += (this.numItems == 1) ? " match" : " matches";
			matchesString += ")</span>";
			
			$('.ft-font-search-header').html("\""+this._getVal()+"\""+matchesString);
			this.numPerPage = parseInt($(".ft-font-controls select option:selected").val());
			this.pages = Math.ceil(this.numItems/this.numPerPage);

			if(this.numItems==0) return;//do nothing, ie pagination is left hidden
			this.topPagination.show();

			//this.searchContent.append('<div>total items:'+num+'<div>');
			//this.searchContent.append('<div>total pages:'+pages+'<div>');
			this._updatePagination(this.numPerPage,this.pages);
		}
		,_updatePagination:function(numPerPage,pages){
			if(this.pages>1){
				var lis = this.fontControls.find(".ft-pagination li");
				var prev = lis.eq(1);//thats because we use float:right on li
				var next = lis.eq(0);
				this.q = encodeURIComponent(this._getVal()).replace("%20","+");
				this.text = encodeURIComponent($("#font_text").val()).replace("%20","+");;
				this.fontsize = parseInt($("#font_fontsize").val());
				this._rebindSelectBox(this.q,this.text,this.fontsize);

				prev.children("a").attr('href',"/Font-Search/page"+pages+"?q="+this.q+"&text="+this.text+"&fontsize="+this.fontsize+"&fontsPp="+numPerPage);
				next.children("a").attr('href',"/Font-Search/page2?q="+this.q+"&text="+this.text+"&fontsize="+this.fontsize+"&fontsPp="+numPerPage);
				this.fontControls.find(".ft-pagination ul").css('visibility',"");
			}
			else{
				this.fontControls.find(".ft-pagination ul").css('visibility',"hidden");
			}
			this.fontControls.find(".ft-pagination span").html("Page 1 of "+pages);
			this.fontControls.show();
		}
		,_rebindSelectBox:function(q, text, size){
			this.fontControls.find("select").unbind('change').bind('change',{q:q,text:text,size:size},function(e){
				var fontsPp = $(this).val();
				$.cookie('fontsPp', null);
				var domain = document.domain;
				var pos = domain.indexOf('flamingtext');
				if (pos > -1)
				{
				domain = domain.substring(pos);
				}
				else{domain = 'flamingtext.com'}
				$.cookie('fontsPp', fontsPp, {path: '/', domain: '.' + domain});

				var location = window.location.href;
				var pathStart = location.indexOf("/",8);//account for https://
				var newLoc = location.substring(0,pathStart)+"/Font-Search/page1?q="+e.data.q+"&text="+e.data.text+"&fontsize="+e.data.size+"&fontsPp="+fontsPp;
				window.location = newLoc;
			});
		}
		,_showResults:function(items){
			var maxI = Math.min(this.numPerPage,items.length);
			fontsManager = new FontsManager();
			this.resultsDiv = $('<div class="ft-font-search-results"></div>').appendTo(this.searchContent);

			for(var i = 0;i<maxI;i++){
				this._buildItem(items[i],i);
			}
			$(".ft-font-preview-size .active").trigger("click", true);

			if(items.length == 0)
				$('<div class="ft-font-search-results-none"><p style="font-weight: bold; margin-bottom: 0.5em;">No fonts found for: "<span>'+this._getVal()+'</span>"</p><p>Suggestions:</p><ul><li>Use one search word. You can also search for parts of a word, for example "Di" will find "Disco font".</li><li>Search for something else.</li><li>Browse alphabetically or use the categories to the left to find your font.</li></ul></div>').appendTo(this.resultsDiv);
		}
		,_buildItem:function(item,i){
			var itemWithSpaces = item.replace(/\+/gi," ");
			var itemUri = encodeURIComponent(item.replace(/\ /gi,"-"));

			var str = '<div class="ft-font-search-result-item">'
				+'<div class="ft-font-search-result-item-header">'
					+'<span class="ft-font-search-result-title">'
						+'<a title="Click to use '+itemWithSpaces+' font" href="/Font-'+itemUri+'">'+itemWithSpaces+'</a>'
					+'</span>'
				+'</div>'
				+'<div class="ft-font-search-result-content-wrapper">'
					+'<div class="ft-font-search-result-content">'
						+'<img src="http://cdn1.ftimg.com/images/loading.gif" alt="" id="font'+i+'_statusImage" class="statusImage font_statusImage">'
						+'<a href="/Font-'+itemUri+'">'
							+'<img title="Click to use '+itemWithSpaces+' font" alt="'+itemWithSpaces+' font" src="" id="font'+i+'_imagePreview">'
						+'</a>'
						+'<div class="fontStatusMessage" id="font'+i+'_statusDiv" style="display: none;"></div>'
						+'<div class="fontErrorsMessage" id="font'+i+'_errorsDiv" style="display: none;"></div>'
					+'</div>'
				+'</div>'
			+'</div>';
			var itemDiv = $(str).appendTo(this.resultsDiv);
			setTimeout(function(){
				$("#font"+i+"_imagePreview").fontmanager({
					idPrepend:"font"+i+"_"
					,inputs:["#font_script", "#font_text", "#font_fontsize"]
					,fontname:itemWithSpaces
					,defaultText:itemWithSpaces
					,statusImageValue:"http://cdn1.ftimg.com/images/loading.gif"
					,loadingImg:"http://cdn1.ftimg.com/images/loading.gif"
					,gettingNewImageLabel:""
					,getImgOnInit: true
					,fontsManager:fontsManager
				});
			},i*50);
		}
		,_updateBottomPanel:function(){
			if (this.pages>1)
				this._buildBottomPagination(this.numPerPage,this.pages);
			if (this.numItems>5)
				this._showBackToTop();
		}
		,_buildBottomPagination:function(numPerPage,pages){
			//if(this.bottomPagination)
			//	this.bottomPagination.remove();
			this.bottomPagination = this.searchContent.children(".ft-pagination");
			if(this.bottomPagination.length){
				this._updateBottomPagination();
				return;
			}
			this.bottomPagination = $('<div class="ft-pagination"></div>').appendTo(this.searchContent);
			var pageGroup = $('<div class="ft-pagegroup-extra"></div>').appendTo(this.bottomPagination);
			var ul = $('<ul></ul>').appendTo(pageGroup);
			var maxI = Math.min(pages,9);
			for(var i=0;i<maxI;i++){
				var classSelected = i==0? ' class="selected"':'';
				var liStr = '<li'+classSelected+'>';
				if(i!=0)
					liStr += '<a href="/Font-Search/page'+(i+1)+'?q='+this.q+'&text='+this.text+'&fontsize='+this.fontsize+'&fontsPp='+numPerPage+'">';
				liStr += (i+1);
				if(i!=0)
					liStr +='</a>';
				liStr += '</li>';

				var li = $(liStr).appendTo(ul);
			}
			if(maxI<pages){
				$('<li class="more">...</li>').appendTo(ul);
				$('<li><a href="/Font-Search/page'+pages+'?q='+this.q+'&text='+this.text+'&fontsize='+this.fontsize+'&fontsPp='+numPerPage+'">Last</a></li>').appendTo(ul);
			}
			
			var str = '<div class="ft-pagegroup">'
					+'<ul>'
						+'<li><a href="/Font-Search/page2?q='+this.q+'&text='+this.text+'&fontsize='+this.fontsize+'&fontsPp='+numPerPage+'">&gt;</a></li>'
						+'<li><a href="/Font-Search/page'+pages+'?q='+this.q+'&text='+this.text+'&fontsize='+this.fontsize+'&fontsPp='+numPerPage+'">&lt;</a></li>'
					+'</ul>'
				+'<span>Page 1 of '+pages+'</span>'
				+'</div>';
			this.bottomPagination.append(str);
		}
		,_updateBottomPagination:function(){
			var a = this.bottomPagination.find("a");
			var self = this;
			$.each(a,function(el, i){
				var href = $(this).attr('href');
				var idx = href.indexOf("?q=");
				href = href.substring(0,idx);
				href = href + '?q='+self.q+'&text='+self.text+'&fontsize='+self.fontsize+'&fontsPp='+self.numPerPage;
				$(this).attr('href',href);
			});
		}
		,_showBackToTop:function(){
			//if(this.backToTop)
			//	this.backToTop.remove();
			this.backToTop = this.searchContent.children(".ft-back-to-top");
			if(!this.backToTop.length)
				this.backToTop = $('<div style="text-align: center; font-size: 14px;" class="ft-back-to-top"><a href="#">Return to top of page</a></div>').appendTo(this.searchContent);
		}
	});


})(jQuery);
/*
//Slider mapping functions

//opts has this structure:
opts={
	val:    x //value to convert
	,min:   x //min of the slider
	,max:   x //max of the slider
	,logic: x //logic to use,eg "none","font1000"
}
*/
var sliderLogicFunction = {
	toSlider:{
		"none" : function(opts){return Number(opts.val);}
		,"font1000":function(opts){
			var val = parseInt(opts.val); var min = opts.min; var max = opts.max;
			var mid = Math.floor((max+min)/2); // 502

			if(typeof(val) != 'number') {
				log("trouble: toSlider.val is not a number");
				return 100;
			}

			if(val <= min)
				return min;
			if(val >= max)
				return max;

			if(val<200) {
				var ret = min+Math.round((val-min)/(400-min-min)*(max-min));
				//console.log("from val "+val+" to "+ret);
				//return Math.round(val/200*(mid-min));
				return ret;
			}
			else
				return mid+Math.round((val-200)/(max-200)*(max-mid));
		}
		,"onOffSwitch":function(opts){
			if ("on" == opts.val)
				return 1;
			return 0;
		}
	}
	,fromSlider:{
		"none" : function(opts){return Number(opts.val);}
		,"font1000":function(opts){
			var val = parseInt(opts.val); var min = opts.min; var max = opts.max;
			var mid = Math.floor((max+min)/2); // 502
			
			if(val<mid) {
				//var ret = min+Math.round((val-min)/(mid-min)*200);
				var ret = min+Math.round((val-min)*(400-min-min)/(max-min));
				//return min+Math.round((val-min)/(mid-min)*200);
				//console.log("QQ: from "+val+" to " +ret);
				return ret;
			} else
				return 200+Math.round((val-mid)/(max-mid)*(max-200));
		}
		,"onOffSwitch":function(opts){
			if (opts.val)
				return "on";
			return "off";
		}
	}
};

var mapToSlider = function(opts){
	return sliderLogicFunction.toSlider[opts.logic](opts);
};
var mapFromSlider = function(opts){
	return sliderLogicFunction.fromSlider[opts.logic](opts);
};

fontCategories=[{name:'new',title:'New'},{name:'featured',title:'Featured'},{name:'cool',title:'Cool'},{name:'3d',title:'3D'},{name:'celtic',title:'Celtic'},{name:'decorated',title:'Decorated'},{name:'dingbats',title:'DingBats'},{name:'european',title:'European'},{name:'fontbats',title:'FontBats'},{name:'handwriting',title:'Handwriting'},{name:'love',title:'Love'},{name:'oldenglish',title:'OldEnglish'},{name:'outline',title:'Outline'},{name:'rounded',title:'Rounded'},{name:'script',title:'Script'},{name:'standard',title:'Standard'}];
$(document).ready(function() {
	
	//only display for doodleMaker loog
	var scriptName = $("input:hidden[name='script']");
	if (typeof scriptName == 'undefined' || scriptName.val() != "colored2-logo") {
		return;
	}

	//only display doodleMaker if external referrer
	var referrer = document.referrer;
	if (referrer.length > 30)
		referrer = referrer.substring(0,30);

	//if (referrer.indexOf('flamingtext') == -1 && referrer != "") {
	if (referrer.indexOf('flamingtext') == -1 && referrer != "") {

		var doodleDiv = $(
		"<div class='ft-doodle-note ft-note-yellow' style='overflow:auto; text-align: left; color: #2a2a2a; font-size: 15px;'>"
		+"<img width='134' height='90' style='float:left; margin-right: 20px; border: 1px solid #000033; box-shadow: 1px 1px 2px #000033;' src='http://cdn1.ftimg.com/images/doodle-maker-image.png' alt='Doodle made in ImageBot' />"
		+"<div>"
		+"<p style='color: #2a2a2a;line-height:1.5em;'>Looking for a doodle maker with stickers, freehand drawing, and much more?</p>"
		+"<a class='ft-doodle-btn' href='http://www.flamingtext.com/imagebot'>DOODLE</a>"
		+"<a style='float:left; margin-top: 23px;' id='close-doodle-note' href='#close'>No thanks, I want this Doodle logo</a>"
		+"</div>"
		+"</div>"
		);
		var placeToInsert = $("form[name='proxyform']").find(".box_outer").first();
		doodleDiv.insertBefore(placeToInsert);

		$("#close-doodle-note").bind("click", function(e){
			e.preventDefault();
			doodleDiv.animate({
				height: 0,
				paddingTop: 0,
				paddingBottom: 0
			}, 300, function() {
				doodleDiv.hide();
			});
		});
	}
});
var animator;
var imagebot = imagebot || undefined;
var $html = $("html");

//dont run in imagebot mode (breaks), animator, oldIE, or simpleBrowser (doesn't work)
if (!imagebot && animator != 1 && !$html.hasClass("oldIE") && !$html.hasClass("simpleBrowser")) {

	$(document).ready(function(){
		var lastAd = 0;
		var boxes = $(".box_outer:not(.preload-box)").addClass("hide");
		//var top = $(".logo_tabs"); //not used?
		
		var box="zxczxc";
		$.each(boxes,function(i,item) {
			var boxId = box+'-'+i;
			$(item).attr('id',boxId).addClass("logo_tab_content");
			if (i > 0)
				$(item).addClass("hide");
			var tabBox = $(item).attr('rel'); // eg textBox/logoBox
			var tabTab = tabBox.replace("Box","tab").replace("imageSize","image");
			var a =$(item).find("div div a");
			if (a.length > 0) {
				var newTab = $("<li rel='"+boxId+"' data-tab='"+tabTab+"' class='logo_tab'>" +$(a[0]).text()+"</li>");
				newTab.appendTo(".logo_tabs");
			}
		});

		function activateTab($tab) {
			boxes.addClass("hide");
			$(".logo_tab").removeClass("selected");
			$tab.addClass("selected");
			$("#"+$tab.attr('rel')).removeClass("hide");
			if ((new Date()).getTime() > lastAd + 30000) {
				lastAd = (new Date()).getTime();
				if (window.googletag && googletag.pubads)
					googletag.pubads().refresh();
			}
		}

		var firstclick = true;
		//bind click event to the tabs
		$(".logo_tab").on("click touchstart", function(e) {
			//e.preventDefault();
			activateTab($(this));

			//var loc = $(this).html().trim().toLowerCase()+"tab";
			var loc = $(this).attr('data-tab');
			//setTimeout(function() {;var i=new Image();i.src="/Ajax/track/net-fu/dynamic.cgi?_loc=blah";}, 200);

			var extra="";
			if (firstclick) {
				firstclick=false;
				extra="&_action=firsttab";
			}
			//new Image().src = "/Ajax/track/net-fu/dynamic.cgi?_loc="+loc+"&_="+Math.floor(Math.random()*100000);
			// you can send multiple actions at once.
			new Image().src = "/Ajax/action/net-fu/dynamic.cgi?_action="+loc+extra+"&_="+Math.floor(Math.random()*100000);
			//i.onload(function() {window.alert('asd');});
		});

		$(".preload-box.box_outer").remove();
	
		boxes.addClass("hide").removeClass("preload");
		$(".box_title").addClass("hide");

		//if we use wizard, let that handle tab selecting
		var $wizardBar = $(".ft-wizard-statusbar");

		if ($wizardBar.length === 0) {
			$(".logo_tab:selected").removeClass("selected");
			//select (first) tab
			var $tabToSelect = $(".logo_tab").first();
			$tabToSelect.addClass("selected");
			//show tab content
			$("#"+$tabToSelect.attr('rel')).removeClass("hide");
		} else {
			//log("wizard running..");
			//wizard status bar related functions, including selecting tab if hash (on user back, from result page)
			var $wizardTextBtn = $("#wizard-text-btn");
			var $wizardCustomizeBtn = $("#wizard-customize-btn");
	
			var wizardClick = function(element){
				if(element.hasClass("selected"))
					return false;
				//put removed titles back
				$wizardBar.find(".selected").attr('title', $wizardBar.find(".selected").data('title')).removeClass("selected");
				element.addClass("selected");
				//remove hover title for selected element
				var title = element.attr('title');
				element.data('title', title).removeAttr('title');
				//avoid repeating with localstorage instead, if at all
				//$(".formEntryName.highlight:not(.already)").addClass("already");
				$(".formEntryName.highlight").removeClass("highlight");
				return true;
			}
			$("#wizard-done-btn").one("click", function(){
				if (!wizardClick($(this)))
					return;
				$(this).html("wait..");	
				//TODO: set form: _loc=donewiz

				$(".ft-create-logo-btn").click(); //submit form
			});

			$wizardTextBtn.on("click", function(){
				if (!wizardClick($(this)))
					return;	
				//$(".logo_tab").first().click(); //select Text tab
				activateTab($(".logo_tab").first());
			});
			$wizardCustomizeBtn.on("click", function(){
				if (!wizardClick($(this)))
					return;
				var $tab = $(".logo_tab:nth-child(2)");
				if(!($tab.hasClass("selected"))){
					activateTab($(".logo_tab:nth-child(2)")); //select Logo tab (2nd)
				}
				//show customize tooltip - ONCE (only when localStorage supported)
				if (localStorage 
				&& !(localStorage.getItem('ft-dynamic-seenCustomizeTooltip') === "true")) { //not seen
					var toolTipMsg = "Change the logo's color and appearance here.";
					if ($(".logo_tabs").children().length > 2)
						toolTipMsg += "</br>Explore the next tabs (Shadow, Background, Image) for more options.";

					showTooltip(toolTipMsg, $tab, function(){
						//callback function on hide
						try {
							localStorage.setItem('ft-dynamic-seenCustomizeTooltip', true);
						} catch(error) {
							return false;
						}
					});
				}
			});

			//make sure right wizard step is active (if user clicked back from result page)
			$wizardBar.find(".selected").removeClass("selected");
	
			if (window.location.hash === "#customize")
				$wizardCustomizeBtn.click();
			else {
				$wizardTextBtn.click();
		
				//TODO: if not in localStorage, if still on first tab, if has not changed text, and after 5?10s?
				/*setTimeout(function(){
					var $elemToHighlight = $("#textDiv textarea");
					showTooltip("Write your text here!", $elemToHighlight, function(){});
				},15000);*/
			}
			//listen for clicks on logo_tabs, to progress wizard (only progress forward, not backward)
			$(".logo_tab").on("click", function(){
				if($(this).index() > 0){
					wizardClick($wizardCustomizeBtn);
				}
			});
		}
	});
}
