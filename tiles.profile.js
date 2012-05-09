var copyOnly = function(mid) {
	return mid in {
	}
};

var profile = {
	releaseDir: "../release",
	basePath: "..",
	action: "release",
	cssOptimize: "comments",
	mini: true,
	//optimize: "closure",
	//layerOptimize: "closure",
	stripConsole: "all",
	selectorEngine: "acme",
	staticHasFeatures: {
		"djeo-built": 1
	},
	layers: {
		"dojo/dojo": {
			include: [
				"dojo/dojo",
				"dojo/domReady",
				"tiles/Tileable"
			],
			customBase: true,
			boot: true
		}
	},
	resourceTags: {
		copyOnly: function (filename, mid) {
			return copyOnly(mid);
		},
		amd: function(filename, mid) {
			return !copyOnly(mid) && /\.js$/.test(filename);
		}
	}
};