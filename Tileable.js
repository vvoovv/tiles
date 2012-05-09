define([
	"dojo/_base/declare",
	"dijit/_WidgetBase",
	"./BaseTileable",
	"./_ScrollableMixin"
], function(declare, WidgetBase, BaseTileable, ScrollableMixin){
	
/*
	Bbox of a tile x/y (coordinates in pixels; (left,top)-(right,bottom)): 
	(x*tileSizeX, y*tileSizeY) - ((x+1)*tileSizeX, (y+1)*tileSizeY )
*/

// module:
//		dojox/tiles/Tileable
// summary:
//		The base class for tiles

return declare([WidgetBase, ScrollableMixin, BaseTileable], {

	buildRendering: function(){
		this.inherited(arguments);
		this._buildRendering();
	},

	startup: function(){
		this.inherited(arguments);
		this._startup();
	}
});

});
