//
// openmirEditor - A javascript app using backbone.js that uses
// several openMir 
//
// sness@sness.net (c) 2012 GPLv3
//

$(document).ready(function () {

    //
    // The main model that loads the recording from the server and
    // coordinates all the actions between different UI elements.
    //
    RecordingModel = Backbone.Model.extend({
        urlRoot: '/api/v1/recording/',

        defaults : {
            audioState : "0",
            winSize : 1024
        },
        

        initialize: function() {
            this.bind('playPause', this.playPauseAudio);
            this.bind('change:url', this.urlChange);
            this.bind('change:currentTimeSec', this.currentTimeSecChanged);
            this.bind('change:startSec', this.startSecChanged);

            this.audio = new Audio();

            var that = this;
            window.setInterval(function(){
                var audioState = that.get("audioState");
                if (audioState == "1") {
                    that.set("currentTimeSec", that.audio.currentTime);
                }
            },100);

        },

        seek: function(newTimeSec) {
            this.audio.currentTime = newTimeSec;
            var audioState = this.get("audioState");
        },

        currentTimeSecChanged: function() {
            var currentTimeSec = this.get("currentTimeSec");
        },

        startSecChanged: function() {
            var startSec = this.get("startSec");
        },

        urlChange: function () {
            this.set("spectrogramUrl", "/visualizations/spectrogram/" + this.id);
        },

        parse: function(response) {
            this.audio.setAttribute("src",response.url);
            this.audio.load();
            return response;
        },

        playPauseAudio: function() {
            var audioState = this.get("audioState");
            if (audioState == "1") {
                this.set("audioState", "0");
                this.audio.pause();
            } else {
                this.set("audioState", "1");
                var currentTime = this.get("currentTimeSec");
                this.audio.currentTime = currentTime;
                this.audio.play();
            }
        },

    });

    //
    // The shuttle controls
    //
    ShuttleView = Backbone.View.extend({
        el: $('#shuttle'),

        events: { 
            'click #playPause': 'clickPlayPause',
            'click #pageForward': 'clickPageForward',
            'click #pageBackward': 'clickPageBackward',
        },

        clickPlayPause: function() {
            recording.trigger("playPause");
        },

        clickPageForward: function() {
            var lengthSec = this.model.get("endSec") - this.model.get("startSec");
            var newStartSec = this.model.get("startSec") + lengthSec;
            var newEndSec = this.model.get("endSec") + lengthSec;
            var url = newStartSec + "/" + newEndSec;
            app.navigate(url, {trigger : true});
        },

        clickPageBackward: function() {
            var lengthSec = this.model.get("endSec") - this.model.get("startSec");
            var newStartSec = this.model.get("startSec") - lengthSec;
            var newEndSec = this.model.get("endSec") - lengthSec;
            var url = newStartSec + "/" + newEndSec;
            app.navigate(url, {trigger : true});
        },

        render: function(){
            $(this.el).empty();
            var template = _.template($("#shuttleTemplate").html());
            var html = template();
            $(this.el).append(html);
        }

    });

    //
    // The Spectrogram View
    //
    SpectrogramView = Backbone.View.extend({
        el: $('#spectrogramContainer'),

        initialize: function() {
            this.model.bind('change:currentTimeSec', this.changeCurrentTimeSec, this);
            this.model.bind('change:predictions', this.changePredictions, this);
            this.model.bind('change:startSec', this.changeStartSec, this);
            this.model.bind('change:winSize', this.changeWinSize, this);
            this.model.bind('change:spectrogramUrl', this.render, this);
        },

        events:{ 
            'seekSecEvent': 'seekSecEvent',
            'saveEvent': 'saveEvent',
            'deleteEvent': 'deleteEvent',
            "change input:text[name=winSize]" : "inputWinSizeChanged",
        },
        
        inputWinSizeChanged: function() {
            var winSize = parseInt($('input:text[name=winSize]').val(),10);
            this.model.set({winSize : winSize});
        },

        seekSecEvent: function(e,newTimeSec) {
            this.model.seek(newTimeSec);
        },

        deleteEvent: function(e,clipId) {
            console.log("SpectrogramView deleteEvent");
            console.log("clipId=" + clipId.clipId);
            var clipCollection = this.model.get("clips");
            var clipModel = clipCollection.get(clipId.clipId);
            console.log("clipModel");
            console.log(clipModel);
            
            clipModel.destroy();
            // console.log("clipCollection before");
            // console.log(clipCollection);
            // // clipCollection.remove(clipModel);
            // console.log("clipCollection after");
            // console.log(clipCollection);
            // clipCollection.sync();
        },

        saveEvent: function(e,changedClips) {
            var collection = this.model.get("clips");

            _.each(changedClips.clips, function(c) {
                var clip = new ClipModel(c);
                collection.add(clip, {merge: true});
            });

            var that = this;
            collection.each(function(clip) {
                if (!clip.get("recording")) {
                    clip.set("recording_id", that.model.get("id"));
                }

                // TODO(sness) - If we create a clip in the
                // recordingAnnotatorSpectrogramPlugin and then save it, propogate
                // the new id back to the recordingAnnotatorSpectrogramPlugin.
                if (clip.hasChanged()) {
                    clip.save();
                }
            });
            
        },

        doLoadClassifier: function(classifierId) {
             $("#spectrogram").trigger('loadClassifierEvent', [classifierId]);
        },

        changeCurrentTimeSec: function() {
             $("#spectrogram").trigger('currentTimeSecEvent', [this.model.get("currentTimeSec")]);
        },

        changePredictions: function() {
             $("#spectrogram").trigger('changePredictionsEvent', [this.model.get("predictions")]);
        },

        changeStartSec: function() {
             $("#spectrogram").trigger('startSecEvent', [this.model.get("startSec"), this.model.get("endSec")]);
        },

        changeWinSize: function() {
             $("#spectrogram").trigger('winSizeEvent', [this.model.get("winSize")]);
        },

        render: function() {
            // Controls
            $("#spectrogramControlsContainer").empty();
            var template = _.template($("#spectrogramControlsTemplate").html());
            var html = template(this.model.toJSON());
            $("#spectrogramControlsContainer").append(html);

            $("#spectrogram").recordingAnnotatorSpectrogramPlugin({
                recordingId : this.model.id,
                spectrogramUrl : this.model.get("spectrogramUrl"),
                winSize : this.model.get("winSize"),
                recordingLengthSec : this.model.get("lengthSec"),
                clips : this.model.get("clips").toJSON(),
                name : this.model.get("name")
            });

        }
        
    });

    ClipModel = Backbone.Model.extend({
        urlRoot: '/api/v1/clip/',
        
    });

    ClipCollection = Backbone.Collection.extend({
        model: ClipModel,

        initialize: function() {
            this.bind('sync', this.doSync);
        },

        doSync: function() {
            $("#spectrogram").trigger('newClips', [this.toJSON()]);
        }

    });

    //
    // Classifiers
    //
    Classifier = Backbone.Model.extend({
    });
    
    ClassifierCollection = Backbone.Collection.extend({
        model: Classifier,
        
        url : "/api/v1/classifier/",
        
        parse: function(response) {
            return response.objects;
        }
    });

    ClassifierView = Backbone.View.extend({
        events: {
            "click" : "doClick"
        },
        
        doClick: function() {
            // Send an event to the SpectrogramView to load the
            // classifications for the currently visible region.
            window.spectrogramView.doLoadClassifier(this.model.id);
        },

        initialize: function() {
        },

        render: function() {
            var template = _.template( $("#classifierTemplate").html(), this.model.toJSON() );
            $(this.el).append(template);
        }
    });

    ClassifierListView = Backbone.View.extend({

        initialize: function() {
            this.listenTo(this.collection, "reset", this.render);
        },

        render: function() {
            $(this.el).empty();

            _.each(this.collection.models, function(n) {
                var model = this.collection.get(n);
                var classifierView = new ClassifierView({model: model});
                classifierView.render();
                $(this.el).append(classifierView.el);
            }, this);
        }
    });


    var AppRouter = Backbone.Router.extend({

        initialize: function() {
            // Turn the clips into backbone models
            clips = []
            _.each(window.clipsJson, (function(cj) {
                var c = {id : cj.pk}
                _.extend(c, cj.fields);
                var clip = new ClipModel(c);
                clips.push(clip);
            }));

            this.clipCollection = new ClipCollection(clips);

            // TODO(sness) - Make local to this AppRouter
            window.clipCollection = this.clipCollection;

            // Construct recordings from json
            r = {id : window.recordingJson[0].pk}
            _.extend(r,window.recordingJson[0].fields);
            r.clips = this.clipCollection;
            r.spectrogramUrl = "/visualizations/spectrogram/" + window.recordingJson[0].pk;
            this.recording = new RecordingModel(r);
            // TODO(sness) - Make local to this AppRouter
            window.recording = this.recording;

            this.spectrogramView = new SpectrogramView({model : this.recording});
            // TODO(sness) - Make local to this AppRouter
            window.spectrogramView = this.spectrogramView;

            this.shuttleView = new ShuttleView({model : this.recording});

            // Construct Classifiers from json
            classifiers = []
            _.each(window.classifiersJson.objects, (function(cj) {
                var classifier = new Classifier(cj);
                classifiers.push(classifier);
            }));
            this.classifierCollection = new ClassifierCollection(classifiers);
            this.classifierListView = new ClassifierListView({ el: "#classifiers", collection: this.classifierCollection});
        },
        
        routes: {
            "": "mainView",
            ":startSec/:endSec": "mainView",
        },

        mainView: function(startSec, endSec) {
            if (!startSec) {
                startSec = 0;
                endSec = 50.000;
            }
            this.recording.set({"startSec" : parseFloat(startSec),  "endSec" : parseFloat(endSec)});
            this.shuttleView.render();
            this.spectrogramView.render();
            this.classifierListView.render();
        }

    });
    
    // Instantiate the router
    app = new AppRouter;
    Backbone.history.start();


});
