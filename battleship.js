//     mehh Battleship against yourself.
//		 This is a battleship practice app I made to learn backbone.
//		 There's no backend, and you can only play against yourself.

// Default namespaces for the app.
var app = {
	views: {},
	models: {},
	collections: {},
	templates: {}
};

// models.Ship
// --------------

//Represents a battleship
app.models.Ship = Backbone.Model.extend({
	initialize: function(attr){
		this.set('remainingLives', attr.length, {silent: true});
	},
	defaults: {
		deployed: false
	},
	isSunk: function(){
		return this.get("remainingLives") <= 0;
	},
	// Attacks the shit and decrements remaining lives and fires a hit event
	hit: function(){
		var numOfLives = this.get("remainingLives");
		this.set("remainingLives", numOfLives-1);

		this.trigger("hit", this);

		if (this.isSunk()){
			this.trigger("sunk", this);
		}

		return this;
	}
});

//models.Placeable
//----------------

//Placeable is the model that backs a placeable view (where you place your ship).
//It's where you place your ships and where your opponent attacks.
//Placeable also hold a reference to a ship. For example, if there's a ship
//with a length of 3, then there would be 3 placeables pointing to that ship.
app.models.Placeable = Backbone.Model.extend({
	defaults: {
		//The placement state can "occupied","hit", or "miss"
		placementState: "",
		ship: null
	},
	//Siblings is an object of four pointers that point
	//to its adjacent cells. All placeable instances would
	//make up a graph. Makes it easier to walk around.
	siblings: {},
	//Iterates through each adjacent cell with a callback
	andEachAdjacentCells: function(num, direction, callback){
		_.each(this.andAdjacentCells(num, direction), callback);
	},
	//All or nothing retrieval of current AND adjacent cells based on a direction
	//and number of cells to retrieve.
	andAdjacentCells: function(num, direction){
		var foundCells = [this];
		num--;// because its inclusive of this

		while(num--){
			foundCells.push(_.last(foundCells).siblings[direction]);

			if ( _.last(foundCells) == null){
				foundCells = [];
				break;
			};
		}
		return foundCells;
	},
	//Creates a reference the provided ship.
	place: function(ship){
		this.set("ship", ship);
		this.set("placementState", "deployed");
	},
	//Hit the underlying ship AND set appropriate placement state.
	strike: function(){
		var ship;
		if(ship = this.get("ship")){
			this.set("placementState", "hit");
			ship.hit();
		}else{
			this.set("placementState", "miss");
		}
	}
})

//models.Strikable
//----------------

//Strikable is a dumb version of Placeable, its to serve
//as the model for attacks against the opponent. Unlike Placeable
//there's no need to keep track of siblings, we only need to know
//know if there's anything at that cell.
app.models.Strikable = Backbone.Model.extend({
	defaults: {
		afterMath: "",
		isOccupied:false,
		position:0
	},
	//Strikes and updates afterMath
	strike: function(){
		if(this.get('isOccupied')){
			this.set('afterMath', 'hit');
		} else {
			this.set('afterMath', 'miss')
		}
		return this;
	}
});

//collections.Aresenal
//--------------------
//A collection of your ships.
app.collections.Aresenal = Backbone.Collection.extend({
	model: app.models.Ship,
	initialize: function(){
		var self = this;
		//Will trigger a destroyed event when all the ship is sunk.
		//Use this to do a nice GAME OVER screen.
		this.on('hit', function(){
			var defeated = self.every(function(ship){
				return ship.isSunk();
			})

			if (defeated){
				self.trigger("destroyed", self);
			}
		});
	},
	//Totals the remaining lives of all ships in aresenal.
	remainingLives: function(){
		return this.reduce(function(memo, obj){
			return memo + obj.get('remainingLives');
		}, 0);
	},
	//returns true if all ships are deployed on the map.
	//use this to determine if we can start the game.
	allDeployed: function(){
		return this.every(function(ship){
			return ship.get("deployed");
		});
	}
});

//collections.Strikables
//--------------------

//Holds all stikable models.
app.collections.Strikables = Backbone.Collection.extend({
	//Adds a position to the strikable on("add").
	//We need to keep track of position because it'll be something
	//we send over to the server. In other words, it's where you tried to attack.
	initialize: function(){
		this.on('add',function(model, collection, options){
			model.set("position", options.at);
		})
	}
});

//collections.Placeables
//--------------------

//Holds all placeable models.
app.collections.Placeables = Backbone.Collection.extend({
	//Treats a placeable as a node and creates a graph out of it.
	//Takes in the length of one side the grid, could be used for different layouts.
	meshify: function(len){
		//Create the references
		for (var i = 0, l = this.length-1; i <= l; i++) {
			var top = this.at(i-len) || null,
					bottom = this.at(i+len) || null,
					left = this.at(i-1) || null,
					right = this.at(i+1) || null;

			//Removes the right reference if we're at the right edge.
			if(((i+1)%len) == 0){
				right = null;
			}

			//Removes the left reference if we're at the left edge.
			if(((i)%len) == 0){
				left = null;
			}

			//Set the siblings
			this.at(i).siblings = {
				top: 		top,
				right: 	right,
				bottom: bottom,
				left: 	left
			};
		};
	},
	//Strikes a particular model within the collection
	strikeAt: function(index){
		var cell = this.at(index);
		cell.strike();
	}
});

//views.StrikableView
//--------------------

//Listens for clicks and strikes the underlying model. Also keeps track of changes to its
//strikable model's afterMath attribute.
app.views.StrikableView = Backbone.View.extend({
	className: "strikable-cell",
	templateName: "strikeCellTemplate",
	initialize: function(){
		this.listenTo(this.model, "change:afterMath", this.render);
		this.parent = this.options.parent;
	},
	events: {"click":"strike"},
	strike: function(){
		this.parent.trigger("strike", this);
		this.model.strike();
		this.render();
	},
	render: function(){
		var template = app.templates[this.templateName];
		this.$el.removeClass(this.model.previous("afterMath")).addClass(this.model.get("afterMath"));
		this.$el.html(template(this.model.toJSON()));
		return this;
	}
});

//views.PlaceableView
//--------------------

// The responsiblity of PlaceableView is to call the attached draggable callback when a
// shipView is dropped on it and update when its underlying model changes when the opponent
// attacks. Only this and the ShipView uses Jquery UI's draggable/droppable.
app.views.PlaceableView = Backbone.View.extend({
	templateName:"placementCellTemplate",
	initialize: function(){
		//Set up the cell to be droppable.
		this.$el.droppable({ tolerance: "pointer"});
		this.listenTo(this.model, "change:placementState", this.render);
		this.listenTo(this.model, "change:afterMath", this.render);

		//Set up a parent view, this might come in handy later, when i want to fire
		//the parent's events
		this.parent = this.options.parent;
	},
	className:"placement-cell",
	events: {
		//we attached a callback via the ShipView. Call it and pass the underlying model.
		"drop": function(e, obj){
			var callback = obj.draggable.data('callback');
			callback ? callback(this.model) : false;
		}
	},
	render: function(){
		var template = app.templates[this.templateName];
		this.$el.removeClass(this.model.previous("placementState")).addClass(this.model.get("placementState"));
		this.$el.html(template(this.model.toJSON()));
		return this;
	}
});

//views.PlaceablesView
//--------------------

//Responsible for creating all the views based on its collection
//and meshifying it's collection.
app.views.PlaceablesView = Backbone.View.extend({
	childView: app.views.PlaceableView,
	initialize: function(){
		var self = this;
		this.collection.each(function(obj){
			var child = new self.childView({
				model: obj,
				parent:self
			});
			self.$el.append(child.render().el);
		});

		// The grid layout is hardcoded as a 10x10 grid for now
		this.collection.meshify(10);
	}
});

//views.StrikablesView
//--------------------

//Responsible for creating all the views based on its collection.
//A reference to the parent is set on all child views.
app.views.StrikablesView = Backbone.View.extend({
	childView: app.views.StrikableView,
	initialize: function(){
		var self = this;
		this.collection.each(function(obj){
			var child = new self.childView({
				model: obj,
				parent: self
			});
			self.$el.append(child.render().el);
		});
	}
});

//views.ShipLotView
//--------------------

//Container view for the handle(the draggable thing) and control
//(shows the life and ship name) and assigns a shared model
app.views.ShipLotView = Backbone.View.extend({
	initialize: function(){
		this.handleView =  new app.views.ShipView({model: this.model});
		this.controlView = new app.views.ShipControl({model: this.model});

		this.$el.append(this.handleView.render().el);
		this.$el.append(this.controlView.render().el);
	}
});

//views.AresenalView
//--------------------

//Responsible for creating all the views based on its collection.
app.views.AresenalView = Backbone.View.extend({
	el: "#ships",
	childView: app.views.ShipLotView,
	initialize: function(){
		var self = this;
		this.shipLotViews=[];
		this.collection.each(function(ship){
			var view = new self.childView({
				model: ship
			});
			self.shipLotViews.push(view);
			self.$el.append(view.render().el);
		})
	},
	//Finds all the draggables within itself and disables all of them.
	//Use it for when the game starts so that the player doesn't move its ships.
	disableHandles: function(){
		this.$el.find(".ui-draggable").draggable('disable');
	}
});

//views.ShipControl
//-----------------

//Shows the remaining lives of the ship.
app.views.ShipControl = Backbone.View.extend({
	className: "control",
	templateName: "shipLotTemplate",
	initialize: function(){
		this.render();
		this.listenTo(this.model, "change", this.render);
	},
	render: function(){
		var template = app.templates[this.templateName];
		this.$el.html(template(this.presenter()));
		return this;
	},
	presenter: function(){
		var defaultPresenter = this.model.toJSON(),
		lifeMarks = [],
		lives = defaultPresenter.remainingLives;

		while(lives--){
			lifeMarks.push("-");
		}

		return 	_.extend(defaultPresenter, {lifeMarks:lifeMarks});
	}
});

//views.ShipView
//-----------------

//Responsible for attaching ships to grids, pivoting them vertically/horizontally, and
//acting as a  draggable element.
app.views.ShipView = Backbone.View.extend({
	className:"ship-cell",
	templateName:"shipTemplate",
	//Keep track of the ships orientation, which is defaulted to "right"
	orientationOnMap:"right",
	initialize: function(){
		this.occupiedCells = [];

		//jquery UI specific options
		this.$el.draggable({
			snap: ".placement-cell",
			snapMode: "inner",
			snapTolerance: 25
		});

		this.listenTo(this.model, "change", this.render);

		//Detaches the attachShip function and bind it with this. This way the only thing
		//the placement cell knows lesss about the ShipView.
		this.$el.data('callback', _.bind(this.attachShip, this));
		this.$el.on('drag', this.detachShip);

		this.template = this.options.template;
	},
	events: {
		"click .toggle": "pivotShip",
		"drag":"detachShip"
	},
	render: function(){
		var template = app.templates[this.templateName];
		this.$el.html(template(this.presenter())) ;
		return this;
	},
	//toggles the ships orientation
	pivotShip: function(e){
		e.preventDefault();
		this.orientationOnMap = this.orientationOnMap == "right" ? "bottom" : "right";
		if(_.isEmpty(this.occupiedCells)) return false;
		var head = this.occupiedCells[0];
		this.detachShip();
		this.attachShip(head, this.orientationOnMap);
	},
	//Detaches the ship by going through each placement model and clearing the pointer
	//to the ship.
	detachShip: function(){
		if(_.isEmpty(this.occupiedCells)) return this;

		_.each(this.occupiedCells, function(cell){
			cell.set('ship', null);
			cell.set('placementState', "");
		})
		this.occupiedCells = [];
		this.model.set("deployed", false);
	},
	//Disables drag for this particular view.
	disableDrag: function(){
		this.$el.draggable("disable");
	},
	//Attaches the ship model to the placement model. Don't attach when theres a collision
	//an already placed ship.
	attachShip: function(cell, direction){
		direction = direction || this.orientationOnMap;
		var self = this;
		var cells = cell.andAdjacentCells(this.model.get('length'), direction);

		//todo: might want to extract the collision detecting in its own method.
		var isCollision = !!_.find(cells, function(cell){
			return !!cell.get("ship");
		});

		if (isCollision){
			this.trigger('collided', this);
			return false;
		}

		this.occupiedCells = cells;
		var self = this;
		_.each(cells, function(cell){
			cell.place(self.model);
		});

		self.model.set("deployed", true);
	},
	presenter: function(){
		var defaultPresenter = this.model.toJSON();
		return _.extend(defaultPresenter, {
			shipMarker : defaultPresenter.shipType.charAt(0)
		});
	}
});

//views.GameStatsView
//-----------------

//Responsible for showing the total remainging lives and starting the game when
//all ships have been deployed.
app.views.GameStatsView = Backbone.View.extend({
	templateName:"gameStatsTemplate",
	el: "#game-stats",
	events: {
		"click .start": function(e){
			e.preventDefault();
			app.startGame();
		}
	},
	initialize: function(){
		this.listenTo(this.collection, "change", this.render);
		this.render();
	},
	render: function(){
		var template = app.templates[this.templateName];
		this.$el.html(template(this.presenter()));
	},
	presenter: function(){
		return {
			remainingLives: this.collection.remainingLives(),
			allDeployed: this.collection.allDeployed()
		}
	}
});

//messages
//-----------------

//might come in handy when you want the ship's "captain" to scream something.
app.messages={
	"closecall": "That was close",
	"imhit":"I'm Hit!",
	"deply":"Yessir deploying nowww..",
	"collision":"Nope don't want to go there..",
	"pivot":"turning...",
	"sunk":"never lose hope..",
	"gameover":"You losee"
}

//other stuff
//-----------------

//builds all the templates
app.buildTemplates = function(){
	app.templates.strikeCellTemplate = Mustache.compile($("#strikeCellTemplate").html());
	app.templates.placementCellTemplate = Mustache.compile($("#placementCellTemplate").html());
	app.templates.shipTemplate = Mustache.compile($("#shipTemplate").html());
	app.templates.shipLotTemplate = Mustache.compile($("#shipLotTemplate").html());
	app.templates.gameStatsTemplate = Mustache.compile($("#gameStatsTemplate").html());
};

//builds all the collections
app.buildCollections = function(){
	app.strikables = new app.collections.Strikables([],{
		model:app.models.Strikable
	});

	app.placeables = new app.collections.Placeables([],{
		model:app.models.Placeable
	});

	for (var i = 100; i ; i--) {
		app.strikables.push({});
		app.placeables.push({});
	};

	app.aresenal = new app.collections.Aresenal([{
		length:3,
		shipType:"BattleShip"
	},
	{
		length:2,
		shipType:"PatrolBoat"
	}]);
};

//builds the battlefield
app.buildBattleField = function(){
	app.placeableMap = new app.views.PlaceablesView({
		el:"#board",
		collection: app.placeables
	});

	app.strikableMap = new app.views.StrikablesView({
		el:'#st_board',
		collection: app.strikables
	});
}

//initialize
app.initialize = function(){
	app.buildTemplates();
	app.buildCollections();
	app.buildBattleField();

	app.aresenalView = new app.views.AresenalView({
		collection: app.aresenal
	});

	app.gameStats = new app.views.GameStatsView({
		collection: app.aresenal
	});
}

//starts the game, to be used when the player is ready
app.startGame = function(){
	if (app.aresenal.allDeployed()){
		app.aresenalView.disableHandles();
	}

	var locations = app.placeableMap.collection.reduce(function(memo, cell, index){
		if(cell.get("ship")){
			memo.push(index);
		}
		return memo;
	},[]);

	//You play with yourself for now.
	_.each(locations, function(i){
		app.strikables.at(i).set('isOccupied', true);
	});

	app.strikableMap.on('strike', function(cell){
		app.placeableMap.collection.strikeAt(cell.model.get("position"));
	});
}

$(function(){
	app.initialize();
})
