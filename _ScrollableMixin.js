define([
	"dojo/_base/declare",
	"dojo/_base/lang",
	"./scrollable"
], function(declare, lang, Scrollable){
	// module:
	//		dojox/mobile/_ScrollableMixin
	// summary:
	//		Mixin for widgets to have a touch scrolling capability.

	var cls = declare(null, {
		// summary:
		//		Mixin for widgets to have a touch scrolling capability.
		// description:
		//		Actual implementation is in scrollable.js.
		//		scrollable.js is not a dojo class, but just a collection
		//		of functions. This module makes scrollable.js a dojo class.

		destroy: function(){
			this.cleanup();
			this.inherited(arguments);
		},

		startup: function(){
			if(this._started){ return; }
			this.init();
			this.inherited(arguments);
		}
	});
	lang.extend(cls, new Scrollable());
	return cls;
});
