// ---
// Copyright (c) 2010 Francesco Cottone, http://www.kesiev.com/
// ---


// Game-specific

var audioserver;
var maingame;
var noface; // Is a fake "actor" in dialogues. The text is ever in the same place.
var tilemaps={}, dialogues={};

function go() {
	gbox.setGroups(["background","player","foes","walls","playerbullets","foesbullets","sparks","foreground","gamecycle"]);
	gbox.setAudioChannels({bgmusic:{volume:0.8},sfx:{volume:1.0}});

	// player, walls, bullets and foes are under z-index layer
	gbox.setRenderOrder(["background",gbox.ZINDEX_LAYER,"sparks","foreground","gamecycle"]);

	maingame=gamecycle.createMaingame("gamecycle","gamecycle");

	// Title intro
	maingame.gameTitleIntroAnimation=function(reset) {
		if (reset) {
			gbox.playAudio("default-music");
			toys.resetToy(this,"rising");
		} else {
			gbox.blitFade(gbox.getBufferContext(),{alpha:1,color:"rgb(150,150,150)"});
			toys.logos.rising(this,"rising",{image:"logo",x:gbox.getScreenHW()-gbox.getImage("logo").hwidth,y:20,speed:1,gapx:250,reflex:0.1,audioreach:"coin"});
		}
	};

	// No level intro animation
	maingame.gameIntroAnimation=function() { return true; };

	// No end level animation
	maingame.endlevelIntroAnimation=function() { return true; };

	// Level animation
	maingame.levelIntroAnimation=function(reset) {
		if (reset) {
			toys.resetToy(this,"default-blinker");
		} else {
			gbox.blitFade(gbox.getBufferContext(),{alpha:1});
			return toys.text.fixed(this,"default-blinker",gbox.getBufferContext(),{font:"big",text:maingame.getNextLevel().label,valign:gbox.ALIGN_MIDDLE,halign:gbox.ALIGN_CENTER,dx:0,dy:0,dw:gbox.getScreenW(),dh:gbox.getScreenH(),time:50});
		}
	};

	// Game is ever over, if the player dies the first time. No life check, since is energy-based.
	maingame.gameIsOver=function() { return true; };

	// Game ending
	maingame.gameEndingIntroAnimation=function(reset){
		if (reset) {
			toys.resetToy(this,"intro-animation");
		} else {
			gbox.blitFade(gbox.getBufferContext(),{alpha:1});
			return;
		}
	};

	// Game events are decided by the map.
	maingame.gameEvents=function() {
		tilemaps.map.mapActions();
	};

	maingame.gameMenu = function(){return true;};

	maingame.pressStartIntroAnimation = function(reset) {
		if (reset) {
			toys.resetToy(this,"default-blinker");
		} else {
			toys.text.blink(this,"default-blinker",gbox.getBufferContext(),{font:"small",text:"PRESSIONE Z PARA COMECAR",valign:gbox.ALIGN_MIDDLE,halign:gbox.ALIGN_CENTER,dx:0,dy:Math.floor(gbox.getScreenH()/3),dw:gbox.getScreenW(),dh:Math.floor(gbox.getScreenH()/3)*2,blinkspeed:10});
			return gbox.keyIsHit("a");
		}
	};

	// Change level
	maingame.changeLevel=function(level) {
		// Cleanup the level
		gbox.trashGroup("playerbullets");
		gbox.trashGroup("foesbullets");
		gbox.trashGroup("foes");
		gbox.trashGroup("walls");
		gbox.purgeGarbage(); // Since we're starting, we can purge all now

		if (level==null)
			level={level:"begin",x:300,y:270,introdialogue:false}; // First stage

		// Dialogues are emptied - will be loaded by bundles. Cache is not needed - each bundle
		// Contains full dialogues for the floor.
		dialogues={};

		// Map data is wiped too. Will be loaded by loadBundle. Other data in tilemaps is
		// kept (i.e. quest status etc)
		delete tilemaps.map;

		// Here the map is loaded. During the load time, the game is still.
		gbox.addBundle({
			file:"resources/bundle-map-"+level.level+".js",
			onLoad:function(){ // This "onload" operation is triggered after everything is loaded.
				help.finalizeTilemap(tilemaps.map); // Finalize the map into the bundle
				gbox.createCanvas("tileslayer",{w:tilemaps.map.w,h:tilemaps.map.h}); // Prepare map's canvas
				gbox.blitTilemap(gbox.getCanvasContext("tileslayer"),tilemaps.map); // Render map on the canvas
				toys.topview.spawn(gbox.getObject("player","player"),{x:level.x,y:level.y}); // Displace player
				tilemaps.map.addObjects(); // Initialize map
				if (level.introdialogue) // Eventually starts intro dialogue.
					maingame.startDialogue("intro"); // game introduction, if needed
			}
		});
	};

	// Game initialization
	maingame.initializeGame=function() {
		// Prepare hud
		maingame.hud.setWidget("cash",{widget:"label",font:"small",value:0,minvalue:0,maxvalue:100,dx:gbox.getScreenW()-60,dy:gbox.getScreenH()-24,prepad:3,padwith:" ",clear:true});

		tilemaps={
			_defaultblock:100, // The block that is over the borders (a wall)
			queststatus:{} // Every step the player does, is marked here (opened doors, sections cleared etc)
		};

		gbox.addObject({
			id:"bg",
			group:"background",
			blit:function() {
				gbox.centerCamera(gbox.getObject("player","player"),{w:tilemaps.map.w,h:tilemaps.map.h});
				gbox.blit(gbox.getBufferContext(),gbox.getCanvas("tileslayer"),{dx:0,dy:0,dw:gbox.getScreenW(),dh:gbox.getScreenH(),sourcecamera:true});
			}
		});

		gbox.addObject(new Player());
	};

	// Changes a tile in the map. It also adds smoke if asked.
	maingame.setTileInMap=function(x,y,tile,smoke) {
		help.setTileInMap(gbox.getCanvasContext("tileslayer"),tilemaps.map,x,y,tile);
	};

	// Starts a dialogue
	maingame.startDialogue=function(id,pause) {
		if ((maingame.difficulty==0)||(!dialogues[id].istutorial)) { // dialogues marked as tutorial are shown only on easy. This flag is in the dialogue itself.
			gbox.addObject({
				group:"foreground",
				id:"dialogue",
				dialogueToRead:id,
				pause:1+(pause==null?0:1), // Pauses a dialog for a while. Is important to wait a frame very time to cancel the last "b" key press (for interacting, for example)
				initialize:function() {
					gbox.getObject("player","player").doPause(true); // First pause the player
				},
				blit:function() {
					if (this.pause)
						this.pause--;
					else if (toys.dialogue.render(this,"dialogue",dialogues[this.dialogueToRead])) { // If the dialogue is ended
						if (dialogues[this.dialogueToRead].endgame) // If the dialogue is marked by "endgame"...
							maingame.gameIsCompleted(); // The game is completed
						else
							gbox.getObject("player","player").doPause(false); // Unpause the player
							gbox.trashObject(this); // Trash the dialogue itself.
						}
					}
			});
		}
	};

	// Add a still object. Are sprites that supports the z-index (houses, trees.) You can walk around these objects
	maingame.addBlock=function(x,y,tileset,frame) {
		gbox.addObject({
			group:"walls",
			tileset:tileset,
			zindex:0, // Needed for zindexed objects
			x:x,
			y:y,
			frame:frame,

			initialize:function() {
				toys.topview.initialize(this); // Any particular initialization. Just the auto z-index
			},

			blit:function() {
				if (gbox.objectIsVisible(this)) {
					// Then the object. Notes that the y is y-z to have the "over the floor" effect.
					gbox.blitTile(gbox.getBufferContext(),{tileset:this.tileset,tile:this.frame,dx:this.x,dy:this.y+this.z,camera:this.camera,fliph:this.fliph,flipv:this.flipv});
				}
			}
		});
	};

	// Add a npc (Not Playing Charachter)
	maingame.addNpc=function(x,y,still,dialogue,questid,talking,silence) {
		// An easy way to create an NPC.
		gbox.addObject(new Npc(x,y,still,dialogue,questid,talking,silence));
	};
	gbox.go();
}

// BOOTSTRAP
gbox.onLoad(function () {
	var mobile = navigator.userAgent.match(/iPhone/) || navigator.userAgent.match(/Android/);

	help.akihabaraInit({title:"Jogando e Aprendendo",splash:{footnotes:["Game for FSA","Game for FSA"]}});

	// We are not going to use faces for dialogues
	noface={ noone:{ x:10, y:170,box:{x:0,y:160,w:gbox.getScreenW(),h:60,alpha:0.5} } };

	audioserver="resources/audio/";

	gbox.addBundle({file:"resources/bundle.js"});

	if (!mobile) gbox.addBundle({file:"resources/bundle-audio.js"});

	gbox.loadAll(go);
}, false);
