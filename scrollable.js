define([
	"dojo/_base/connect",
	"dojo/_base/event",
	"dojo/_base/lang",
	"dojo/_base/window",
	"dojo/dom-class",
	"dojo/dom-construct",
	"dojo/dom-style",
	"./sniff"
], function(connect, event, lang, win, domClass, domConstruct, domStyle, has){

	var _rule, hasTranslate3d;

/*=====
// summary:
//		Utility for enabling touch scrolling capability.
// description:
//		Mobile WebKit browsers do not allow scrolling inner DIVs. (You need
//		the two-finger operation to scroll them.)
//		That means you cannot have fixed-positioned header/footer bars.
//		To solve this issue, this module disables the browsers default scrolling
//		behavior, and re-builds its own scrolling machinery by handling touch
//		events. In this module, this.domNode has height "100%" and is fixed to
//		the window, and this.containerNode scrolls. If you place a bar outside
//		of this.containerNode, then it will be fixed-positioned while
//		this.containerNode is scrollable.
//
//		This module has the following features:
//		- Scrolls inner DIVs vertically, horizontally, or both.
//		- Vertical and horizontal scroll bars.
//		- Flashes the scroll bars when a view is shown.
//		- Simulates the flick operation using animation.
//		- Respects header/footer bars if any.
//
//		dojox.mobile.scrollable is a simple function object, which holds
//		several properties and functions in it. But if you transform it to a
//		dojo class, it can be used as a mix-in class for any custom dojo
//		widgets. dojox.mobile._ScrollableMixin is such a class.
//
//		Also, it can be used even for non-dojo applications. In such cases,
//		several dojo APIs used in this module, such as dojo.connect,
//		dojo.create, etc., are re-defined so that the code works without dojo.
//		When in dojo, of course those re-defined functions are not necessary.
//		So, they are surrounded by the includeStart and includeEnd directives
//		so that they can be excluded from the build.
//
//		If you use this module for non-dojo application, you need to explicitly
//		assign your outer fixed node and inner scrollable node to this.domNode
//		and this.containerNode respectively.
//
//		Non-dojo application should capture the onorientationchange or
//		the onresize event and call resize() in the event handler.
//
// example:
//		Use this module from a non-dojo applicatoin:
//		| function onLoad(){
//		| 	var scrollable = new dojox.mobile.scrollable(dojo, dojox);
//		| 	scrollable.init({
//		| 		domNode: "outer", // id or node
//		| 		containerNode: "inner" // id or node
//		| 	});
//		| }
//		| <body onload="onLoad()">
//		| 	<h1 id="hd1" style="position:relative;width:100%;z-index:1;">
//		| 		Fixed Header
//		| 	</h1>
//		| 	<div id="outer" style="position:relative;height:100%;overflow:hidden;">
//		| 		<div id="inner" style="position:absolute;width:100%;">
//		| 			... content ...
//		| 		</div>
//		| 	</div>
//		| </body>
=====*/

var scrollable = function(){
	this.fixedHeaderHeight = 0; // height of a fixed header
	this.fixedFooterHeight = 0; // height of a fixed footer
	this.isLocalFooter = false; // footer is view-local (as opposed to application-wide)
	this.scrollDir = "v"; // v: vertical, h: horizontal, vh: both, f: flip
	this.weight = 0.6; // frictional drag
	this.threshold = 4; // drag threshold value in pixels
	this.constraint = true; // bounce back to the content area
	this.touchNode = null; // a node that will have touch event handlers
	this.propagatable = true; // let touchstart event propagate up
	this.dirLock = false; // disable the move handler if scroll starts in the unexpected direction
	this.height = ""; // explicitly specified height of this widget (ex. "300px")

	this.init = function(/*Object?*/params){
		if(params){
			for(var p in params){
				if(params.hasOwnProperty(p)){
					this[p] = ((p == "domNode" || p == "containerNode") && typeof params[p] == "string") ?
						win.doc.getElementById(params[p]) : params[p]; // mix-in params
				}
			}
		}
		this.touchNode = this.touchNode || this.containerNode;
		this._v = (this.scrollDir.indexOf("v") != -1); // vertical scrolling
		this._h = (this.scrollDir.indexOf("h") != -1); // horizontal scrolling
		this._f = (this.scrollDir == "f"); // flipping views

		this._ch = []; // connect handlers
		this._ch.push(connect.connect(this.touchNode,
			has('touch') ? "ontouchstart" : "onmousedown", this, "onTouchStart"));
		if(has("webkit")){
			this._ch.push(connect.connect(this.domNode, "webkitAnimationEnd", this, "onFlickAnimationEnd"));
			this._ch.push(connect.connect(this.domNode, "webkitAnimationStart", this, "onFlickAnimationStart"));

			// Creation of keyframes takes a little time. If they are created
			// in a lazy manner, a slight delay is noticeable when you start
			// scrolling for the first time. This is to create keyframes up front.
			for(var i = 0; i < 3; i++){
				this.setKeyframes(null, null, i);
			}
			if(hasTranslate3d){ // workaround for flicker issue on iPhone and Android 3.x/4.0
				domStyle.set(this.containerNode, "webkitTransform", "translate3d(0,0,0)");
			}
		}

		this._speed = {x:0, y:0};
		this._appFooterHeight = 0;
		if(this.isTopLevel() && !this.noResize){
			this.resize();
		}
	};

	this.isTopLevel = function(){
		// subclass may want to override
		return true;
	};

	this.cleanup = function(){
		if(this._ch){
			for(var i = 0; i < this._ch.length; i++){
				connect.disconnect(this._ch[i]);
			}
			this._ch = null;
		}
	};

	this.findDisp = function(/*DomNode*/node){
		// summary:
		//		Finds the currently displayed view node from my sibling nodes.
		if(!node.parentNode){ return null; }
		var nodes = node.parentNode.childNodes;
		for(var i = 0; i < nodes.length; i++){
			var n = nodes[i];
			if(n.nodeType === 1 && domClass.contains(n, "mblView") && n.style.display !== "none"){
				return n;
			}
		}
		return node;
	};

	this.getScreenSize = function(){
		// summary:
		//		Returns the dimensions of the browser window.
		return {
			h: win.global.innerHeight||win.doc.documentElement.clientHeight||win.doc.documentElement.offsetHeight,
			w: win.global.innerWidth||win.doc.documentElement.clientWidth||win.doc.documentElement.offsetWidth
		};
	};

	this.resize = function(e){
		// summary:
		//		Adjusts the height of the widget.
		// description:
		//		If the height property is 'inherit', the height is inherited
		//		from its offset parent. If 'auto', the content height, which
		//		could be smaller than the entire screen height, is used. If an
		//		explicit height value (ex. "300px"), it is used as the new
		//		height. If nothing is specified as the height property, from the
		//		current top position of the widget to the bottom of the screen
		//		will be the new height.

		// moved from init() to support dynamically added fixed bars
		this._appFooterHeight = (this.fixedFooterHeight && !this.isLocalFooter) ?
			this.fixedFooterHeight : 0;
		if(this.isLocalHeader){
			this.containerNode.style.marginTop = this.fixedHeaderHeight + "px";
		}

		// Get the top position. Same as dojo.position(node, true).y
		var top = 0;
		for(var n = this.domNode; n && n.tagName != "BODY"; n = n.offsetParent){
			n = this.findDisp(n); // find the first displayed view node
			if(!n){ break; }
			top += n.offsetTop;
		}

		// adjust the height of this view
		var	h,
			screenHeight = this.getScreenSize().h,
			dh = screenHeight - top - this._appFooterHeight; // default height
		if(this.height === "inherit"){
			if(this.domNode.offsetParent){
				h = this.domNode.offsetParent.offsetHeight + "px";
			}
		}else if(this.height === "auto"){
			var parent = this.domNode.offsetParent;
			if(parent){
				this.domNode.style.height = "0px";
				var	parentRect = parent.getBoundingClientRect(),
					scrollableRect = this.domNode.getBoundingClientRect(),
					contentBottom = parentRect.bottom - this._appFooterHeight;
				if(scrollableRect.bottom >= contentBottom){ // use entire screen
					dh = screenHeight - (scrollableRect.top - parentRect.top) - this._appFooterHeight;
				}else{ // stretch to fill predefined area
					dh = contentBottom - scrollableRect.bottom;
				}
			}
			// content could be smaller than entire screen height
			var contentHeight = Math.max(this.domNode.scrollHeight, this.containerNode.scrollHeight);
			h = (contentHeight ? Math.min(contentHeight, dh) : dh) + "px";
		}else if(this.height){
			h = this.height;
		}
		if(!h){
			h = dh + "px";
		}
		if(h.charAt(0) !== "-" && // to ensure that h is not negative (e.g. "-10px")
			h !== "default"){
			this.domNode.style.height = h;
		}

		// to ensure that the view is within a scrolling area when resized.
		this.onTouchEnd();
	};

	this.onFlickAnimationStart = function(e){
		event.stop(e);
	};

	this.onFlickAnimationEnd = function(e){
		var an = e && e.animationName;
		if(an && an.indexOf("scrollableViewScroll2") === -1){
			return;
		}
		if(e && e.srcElement){
			event.stop(e);
		}
		this.stopAnimation();
		if(this._bounce){
			var _this = this;
			var bounce = _this._bounce;
			setTimeout(function(){
				_this.slideTo(bounce, 0.3, "ease-out");
			}, 0);
			_this._bounce = undefined;
		}else{
			//this.hideScrollBar();
			//this.removeCover();
		}
	};

	this.isFormElement = function(node){
		if(node && node.nodeType !== 1){ node = node.parentNode; }
		if(!node || node.nodeType !== 1){ return false; }
		var t = node.tagName;
		return (t === "SELECT" || t === "INPUT" || t === "TEXTAREA" || t === "BUTTON");
	};

	this.onTouchStart = function(e){
		if(this.disableTouchScroll){ return; }
		if(this._conn && (new Date()).getTime() - this.startTime < 500){
			return; // ignore successive onTouchStart calls
		}
		if(!this._conn){
			this._conn = [];
			this._conn.push(connect.connect(win.doc, has('touch') ? "ontouchmove" : "onmousemove", this, "onTouchMove"));
			this._conn.push(connect.connect(win.doc, has('touch') ? "ontouchend" : "onmouseup", this, "onTouchEnd"));
		}

		this._aborted = false;
		if(domClass.contains(this.containerNode, "mblScrollableScrollTo2")){
			this.abort();
		}else{ // reset scrollbar class especially for reseting fade-out animation
			
		}
		this.touchStartX = e.touches ? e.touches[0].pageX : e.pageX;
		this.touchStartY = e.touches ? e.touches[0].pageY : e.pageY;
		this.startTime = (new Date()).getTime();
		this.startPos = this.getPos();
		this._dim = this.getDim();
		this._time = [0];
		this._posX = [this.touchStartX];
		this._posY = [this.touchStartY];
		this._locked = false;

		if(!this.isFormElement(e.target)){
			this.propagatable ? e.preventDefault() : event.stop(e);
		}
	};

	this.onTouchMove = function(e){
		if(this._locked){ return; }
		var x = e.touches ? e.touches[0].pageX : e.pageX;
		var y = e.touches ? e.touches[0].pageY : e.pageY;
		var dx = x - this.touchStartX;
		var dy = y - this.touchStartY;
		var to = {x:this.startPos.x + dx, y:this.startPos.y + dy};
		var dim = this._dim;

		dx = Math.abs(dx);
		dy = Math.abs(dy);
		if(this._time.length == 1){ // the first TouchMove after TouchStart
			if(this.dirLock){
				if(this._v && !this._h && dx >= this.threshold && dx >= dy ||
					(this._h || this._f) && !this._v && dy >= this.threshold && dy >= dx){
					this._locked = true;
					return;
				}
			}
			if(this._v && Math.abs(dy) < this.threshold ||
				(this._h || this._f) && Math.abs(dx) < this.threshold){
				return;
			}
			//this.addCover();
			//this.showScrollBar();
		}

		var weight = this.weight;
		if(this._v && this.constraint){
			if(to.y > 0){ // content is below the screen area
				to.y = Math.round(to.y * weight);
			}else if(to.y < -dim.o.h){ // content is above the screen area
				if(dim.c.h < dim.d.h){ // content is shorter than display
					to.y = Math.round(to.y * weight);
				}else{
					to.y = -dim.o.h - Math.round((-dim.o.h - to.y) * weight);
				}
			}
		}
		if((this._h || this._f) && this.constraint){
			if(to.x > 0){
				to.x = Math.round(to.x * weight);
			}else if(to.x < -dim.o.w){
				if(dim.c.w < dim.d.w){
					to.x = Math.round(to.x * weight);
				}else{
					to.x = -dim.o.w - Math.round((-dim.o.w - to.x) * weight);
				}
			}
		}
		this.scrollTo(to);

		var max = 10;
		var n = this._time.length; // # of samples
		if(n >= 2){
			// Check the direction of the finger move.
			// If the direction has been changed, discard the old data.
			var d0, d1;
			if(this._v && !this._h){
				d0 = this._posY[n - 1] - this._posY[n - 2];
				d1 = y - this._posY[n - 1];
			}else if(!this._v && this._h){
				d0 = this._posX[n - 1] - this._posX[n - 2];
				d1 = x - this._posX[n - 1];
			}
			if(d0 * d1 < 0){ // direction changed
				// leave only the latest data
				this._time = [this._time[n - 1]];
				this._posX = [this._posX[n - 1]];
				this._posY = [this._posY[n - 1]];
				n = 1;
			}
		}
		if(n == max){
			this._time.shift();
			this._posX.shift();
			this._posY.shift();
		}
		this._time.push((new Date()).getTime() - this.startTime);
		this._posX.push(x);
		this._posY.push(y);
	};

	this.onTouchEnd = function(e){
		if(this._locked){ return; }
		var speed = this._speed = {x:0, y:0};
		var dim = this._dim;
		var pos = this.getPos();
		var to = {}; // destination
		if(e){
			if(!this._conn){ return; } // if we get onTouchEnd without onTouchStart, ignore it.
			for(var i = 0; i < this._conn.length; i++){
				connect.disconnect(this._conn[i]);
			}
			this._conn = null;

			var n = this._time.length; // # of samples
			var clicked = false;
			if(!this._aborted){
				if(n <= 1){
					clicked = true;
				}else if(n == 2 && Math.abs(this._posY[1] - this._posY[0]) < 4
					&& has('touch')){ // for desktop browsers, posY could be the same, since we're using clientY, see onTouchMove()
					clicked = true;
				}
			}
			var isFormElem = this.isFormElement(e.target);
			if(clicked && !isFormElem){ // clicked, not dragged or flicked
				//this.hideScrollBar();
				//this.removeCover();
				if(has('touch')){
					var elem = e.target;
					if(elem.nodeType != 1){
						elem = elem.parentNode;
					}
					var ev = win.doc.createEvent("MouseEvents");
					ev.initMouseEvent("click", true, true, win.global, 1, e.screenX, e.screenY, e.clientX, e.clientY);
					setTimeout(function(){
						elem.dispatchEvent(ev);
					}, 0);
				}
				return;
			}
			speed = this._speed = this.getSpeed();
		}else{
			if(pos.x == 0 && pos.y == 0){ return; } // initializing
			dim = this.getDim();
		}

		if(this._v){
			to.y = pos.y + speed.y;
		}
		if(this._h || this._f){
			to.x = pos.x + speed.x;
		}

		if(this.adjustDestination(to, pos, dim) === false){ return; }

		if(this.scrollDir == "v" && dim.c.h < dim.d.h){ // content is shorter than display
			this.slideTo({y:0}, 0.3, "ease-out"); // go back to the top
			return;
		}else if(this.scrollDir == "h" && dim.c.w < dim.d.w){ // content is narrower than display
			this.slideTo({x:0}, 0.3, "ease-out"); // go back to the left
			return;
		}else if(this._v && this._h && dim.c.h < dim.d.h && dim.c.w < dim.d.w){
			this.slideTo({x:0, y:0}, 0.3, "ease-out"); // go back to the top-left
			return;
		}

		var duration, easing = "ease-out";
		var bounce = {};
		if(this._v && this.constraint){
			if(to.y > 0){ // going down. bounce back to the top.
				if(pos.y > 0){ // started from below the screen area. return quickly.
					duration = 0.3;
					to.y = 0;
				}else{
					to.y = Math.min(to.y, 20);
					easing = "linear";
					bounce.y = 0;
				}
			}else if(-speed.y > dim.o.h - (-pos.y)){ // going up. bounce back to the bottom.
				if(pos.y < -dim.o.h){ // started from above the screen top. return quickly.
					duration = 0.3;
					to.y = dim.c.h <= dim.d.h ? 0 : -dim.o.h; // if shorter, move to 0
				}else{
					to.y = Math.max(to.y, -dim.o.h - 20);
					easing = "linear";
					bounce.y = -dim.o.h;
				}
			}
		}
		if((this._h || this._f) && this.constraint){
			if(to.x > 0){ // going right. bounce back to the left.
				if(pos.x > 0){ // started from right of the screen area. return quickly.
					duration = 0.3;
					to.x = 0;
				}else{
					to.x = Math.min(to.x, 20);
					easing = "linear";
					bounce.x = 0;
				}
			}else if(-speed.x > dim.o.w - (-pos.x)){ // going left. bounce back to the right.
				if(pos.x < -dim.o.w){ // started from left of the screen top. return quickly.
					duration = 0.3;
					to.x = dim.c.w <= dim.d.w ? 0 : -dim.o.w; // if narrower, move to 0
				}else{
					to.x = Math.max(to.x, -dim.o.w - 20);
					easing = "linear";
					bounce.x = -dim.o.w;
				}
			}
		}
		this._bounce = (bounce.x !== undefined || bounce.y !== undefined) ? bounce : undefined;

		if(duration === undefined){
			var distance, velocity;
			if(this._v && this._h){
				velocity = Math.sqrt(speed.x+speed.x + speed.y*speed.y);
				distance = Math.sqrt(Math.pow(to.y - pos.y, 2) + Math.pow(to.x - pos.x, 2));
			}else if(this._v){
				velocity = speed.y;
				distance = to.y - pos.y;
			}else if(this._h){
				velocity = speed.x;
				distance = to.x - pos.x;
			}
			if(distance === 0 && !e){ return; } // #13154
			duration = velocity !== 0 ? Math.abs(distance / velocity) : 0.01; // time = distance / velocity
		}
		console.debug(to);
		this.slideTo(to, duration, easing);
	};

	this.adjustDestination = function(to, pos, dim){
		// subclass may want to implement
		return true;
	};

	this.abort = function(){
		this.scrollTo(this.getPos());
		this.stopAnimation();
		this._aborted = true;
	};

	this.stopAnimation = function(){
		// stop the currently running animation
		domClass.remove(this.containerNode, "mblScrollableScrollTo2");
	};

	this.scrollIntoView = function(/*DOMNode*/node, /*Boolean?*/alignWithTop, /*number?*/duration){
		if(!this._v){ return; } // cannot scroll vertically
		
		var c = this.containerNode,
			h = this.getDim().d.h, // the height of ScrollableView's content display area
			top = 0;
		
		// Get the top position of node relative to containerNode
		for(var n = node; n !== c; n = n.offsetParent){
			if(!n || n.tagName === "BODY"){ return; } // exit if node is not a child of scrollableView
			top += n.offsetTop;
		}
		// Calculate scroll destination position
		var y = alignWithTop ? Math.max(h - c.offsetHeight, -top) : Math.min(0, h - top - node.offsetHeight);
		
		// Scroll to destination position
		(duration && typeof duration === "number") ? 
			this.slideTo({y: y}, duration, "ease-out") : this.scrollTo({y: y});
	};

	this.getSpeed = function(){
		var x = 0, y = 0, n = this._time.length;
		// if the user holds the mouse or finger more than 0.5 sec, do not move.
		if(n >= 2 && (new Date()).getTime() - this.startTime - this._time[n - 1] < 500){
			var dy = this._posY[n - (n > 3 ? 2 : 1)] - this._posY[(n - 6) >= 0 ? n - 6 : 0];
			var dx = this._posX[n - (n > 3 ? 2 : 1)] - this._posX[(n - 6) >= 0 ? n - 6 : 0];
			var dt = this._time[n - (n > 3 ? 2 : 1)] - this._time[(n - 6) >= 0 ? n - 6 : 0];
			y = this.calcSpeed(dy, dt);
			x = this.calcSpeed(dx, dt);
		}
		return {x:x, y:y};
	};

	this.calcSpeed = function(/*Number*/d, /*Number*/t){
		return Math.round(d / t * 100) * 4;
	};

	this.slideTo = function(/*Object*/to, /*Number*/duration, /*String*/easing){
		// summary:
		//		Scrolls to the given position with slide animation.
		this._runSlideAnimation(this.getPos(), to, duration, easing, this.containerNode, 2);
	};

	this.getDim = function(){
		var d = {};
		// content width/height
		d.c = {h:this.containerNode.offsetHeight, w:this.containerNode.offsetWidth};

		// view width/height
		d.v = {h:this.domNode.offsetHeight + this._appFooterHeight, w:this.domNode.offsetWidth};

		// display width/height
		d.d = {h:d.v.h - this.fixedHeaderHeight - this.fixedFooterHeight, w:d.v.w};

		// overflowed width/height
		d.o = {h:d.c.h - d.v.h + this.fixedHeaderHeight + this.fixedFooterHeight, w:d.c.w - d.v.w};
		return d;
	};

	this._runSlideAnimation = function(/*Object*/from, /*Object*/to, /*Number*/duration, /*String*/easing, node, idx){
		// idx: 0:scrollbarV, 1:scrollbarH, 2:content
		if(has("webkit")){
			this.setKeyframes(from, to, idx);
			domStyle.set(node, {
				webkitAnimationDuration: duration + "s",
				webkitAnimationTimingFunction: easing
			});
			domClass.add(node, "mblScrollableScrollTo"+idx);
			if(idx == 2){
				this.scrollTo(to, node);
			}else{

			}
		}else if(dojo.fx && dojo.fx.easing && duration){
			// If you want to support non-webkit browsers,
			// your application needs to load necessary modules as follows:
			//
			// | dojo.require("dojo.fx");
			// | dojo.require("dojo.fx.easing");
			//
			// This module itself does not make dependency on them.
			var s = dojo.fx.slideTo({
				node: node,
				duration: duration*1000,
				left: to.x,
				top: to.y,
				easing: (easing == "ease-out") ? dojo.fx.easing.quadOut : dojo.fx.easing.linear
			}).play();
			if(idx == 2){
				connect.connect(s, "onEnd", this, "onFlickAnimationEnd");
			}
		}else{
			// directly jump to the destination without animation
			if(idx == 2){
				this.scrollTo(to, node);
				this.onFlickAnimationEnd();
			}else{

			}
		}
	};

	this.setKeyframes = function(/*Object*/from, /*Object*/to, /*Number*/idx){
		if(!_rule){
			_rule = [];
		}
		// idx: 0:scrollbarV, 1:scrollbarH, 2:content
		if(!_rule[idx]){
			var node = domConstruct.create("style", null, win.doc.getElementsByTagName("head")[0]);
			node.textContent =
				".mblScrollableScrollTo"+idx+"{-webkit-animation-name: scrollableViewScroll"+idx+";}"+
				"@-webkit-keyframes scrollableViewScroll"+idx+"{}";
			_rule[idx] = node.sheet.cssRules[1];
		}
		var rule = _rule[idx];
		if(rule){
			if(from){
				rule.deleteRule("from");
				rule.insertRule("from { -webkit-transform: "+this.makeTranslateStr(from)+"; }");
			}
			if(to){
				if(to.x === undefined){ to.x = from.x; }
				if(to.y === undefined){ to.y = from.y; }
				rule.deleteRule("to");
				rule.insertRule("to { -webkit-transform: "+this.makeTranslateStr(to)+"; }");
			}
		}
	};

	this.setSelectable = function(node, selectable){
		// dojo.setSelectable has dependency on dojo.query. Re-define our own.
		node.style.KhtmlUserSelect = selectable ? "auto" : "none";
		node.style.MozUserSelect = selectable ? "" : "none";
		node.onselectstart = selectable ? null : function(){return false;};
		if(has("ie")){
			node.unselectable = selectable ? "" : "on";
			var nodes = node.getElementsByTagName("*");
			for(var i = 0; i < nodes.length; i++){
				nodes[i].unselectable = selectable ? "" : "on";
			}
		}
	};

	// feature detection
	if(has("webkit")){
		var elem = win.doc.createElement("div");
		elem.style.webkitTransform = "translate3d(0px,1px,0px)";
		win.doc.documentElement.appendChild(elem);
		var v = win.doc.defaultView.getComputedStyle(elem, '')["-webkit-transform"];
		hasTranslate3d = v && v.indexOf("matrix") === 0;
		win.doc.documentElement.removeChild(elem);
	}
};
return scrollable;
});
