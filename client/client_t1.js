// All Tomorrow's HelpEvents -- client
 
Meteor.subscribe("directory");
Meteor.subscribe("helpEvents");

// If no helpEvent selected, select one.
Meteor.startup(function () {
  Meteor.autorun(function () {
    if (! Session.get("selected")) {
      var helpEvent = HelpEvents.findOne();
      if (helpEvent)
        Session.set("selected", helpEvent._id);
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// HelpEvent details sidebar

Template.details.helpEvent = function () {
  return HelpEvents.findOne(Session.get("selected"));
};

Template.details.anyHelpEvents = function () {
  return HelpEvents.find().count() > 0;
};

Template.details.creatorName = function () {
  var owner = Meteor.users.findOne(this.owner);
  if (owner._id === Meteor.userId())
    return "me";
  return displayName(owner);
};

Template.details.canRemove = function () {
  return this.owner === Meteor.userId() && attending(this) === 0;
};


Template.details.maybeChosen = function (what) {
  var helpId = _.find(this.helpers, function (userId) {
    return userId === Meteor.userId();
  }) || null;

  return what == helpId? "chosen btn-inverse" : "";
};


Template.details.events({
  'click .gotoHelp_yes': function () {
    Meteor.call("gotoHelp", Session.get("selected"));
    return false;
  },
  /*'click .rsvp_maybe': function () {
    Meteor.call("rsvp", Session.get("selected"), "maybe");
    return false;
  },*/
  'click .gotoHelp_no': function () {
    Meteor.call("cancelHelp", Session.get("selected"));
    return false;
  },
  /*'click .invite': function () {
    openInviteDialog();
    return false;
  },*/
  'click .remove': function () {
    HelpEvents.remove(this._id);
    return false;
  }
});

///////////////////////////////////////////////////////////////////////////////
// HelpEvent attendance widget

Template.attendance.gotoHelpName = function () {
  var user = Meteor.users.findOne(this.user);
  return displayName(user);
};

/*Template.attendance.outstandingInvitations = function () {
  var helpEvent = HelpEvents.findOne(this._id);
  return Meteor.users.find({$and: [
    {_id: {$in: helpEvent.invited}}, // they're invited
    {_id: {$nin: _.pluck(helpEvent.rsvps, 'user')}} // but haven't RSVP'd
  ]});
};
*/

/*Template.attendance.invitationName = function () {
  return displayName(this);
};
*/


Template.attendance.nobody = function () {
  return this.helpers.length  === 0;
  //return ! this.public && (this.rsvps.length + this.invited.length === 0);
};

/*Template.attendance.canInvite = function () {
  return ! this.public && this.owner === Meteor.userId();
};
*/

///////////////////////////////////////////////////////////////////////////////
// Map display

// Use jquery to get the position clicked relative to the map element.
var coordsRelativeToElement = function (element, event) {
  var offset = $(element).offset();
  var x = event.pageX - offset.left;
  var y = event.pageY - offset.top;
  return { x: x, y: y };
};

Template.map.events({
  'mousedown circle, mousedown text': function (event, template) {
    Session.set("selected", event.currentTarget.id);
  },
  'dblclick .map': function (event, template) {
    if (! Meteor.userId()) // must be logged in to create events
      return;
    var coords = coordsRelativeToElement(event.currentTarget, event);
    openCreateDialog(coords.x / 500, coords.y / 500);
  }
});

Template.map.rendered = function () {
  var self = this;
  self.node = self.find("svg");

  if (! self.handle) {
    self.handle = Meteor.autorun(function () {
      var selected = Session.get('selected');
      var selectedHelpEvent = selected && HelpEvents.findOne(selected);
      var radius = function (helpEvent) {
	var scale= 1//Math.sqrt(helpEvent.points);
	if (scale>=5)
	    scale=5;
        return 10 + scale * 10;
    };

      // Draw a circle for each helpEvent
      var updateCircles = function (group) {
        group.attr("id", function (helpEvent) { return helpEvent._id; })
        .attr("cx", function (helpEvent) { return helpEvent.x * 500; })
        .attr("cy", function (helpEvent) { return helpEvent.y * 500; })
        .attr("r", radius)
	.attr("class",function(helpEvent){ if(attending(helpEvent)) return "attending";return "waiting";})	    
        .style('opacity', function (helpEvent) {
          return selected === helpEvent._id ? 1 : 0.6;
        });
      };

      var circles = d3.select(self.node).select(".circles").selectAll("circle")
        .data(HelpEvents.find().fetch(), function (helpEvent) { return helpEvent._id; });

      updateCircles(circles.enter().append("circle"));
      updateCircles(circles.transition().duration(250).ease("cubic-out"));
      circles.exit().transition().duration(250).attr("r", 0).remove();

      // Label each with the current attendance count
      var updateLabels = function (group) {
        group.attr("id", function (helpEvent) { return helpEvent._id; })
        .text(function (helpEvent) { return helpEvent.points.toString()})
        .attr("x", function (helpEvent) { return helpEvent.x * 500; })
        .attr("y", function (helpEvent) { return helpEvent.y * 500 + radius(helpEvent)/2 })
        .style('font-size', function (helpEvent) {
          return radius(helpEvent) * 1.25 + "px";
        });
      };

      var labels = d3.select(self.node).select(".labels").selectAll("text")
        .data(HelpEvents.find().fetch(), function (helpEvent) { return helpEvent._id; });

      updateLabels(labels.enter().append("text"));
      updateLabels(labels.transition().duration(250).ease("cubic-out"));
      labels.exit().remove();

      // Draw a dashed circle around the currently selected helpEvent, if any
      var callout = d3.select(self.node).select("circle.callout")
        .transition().duration(250).ease("cubic-out");
      if (selectedHelpEvent)
        callout.attr("cx", selectedHelpEvent.x * 500)
        .attr("cy", selectedHelpEvent.y * 500)
        .attr("r", radius(selectedHelpEvent) + 10)
        .attr("class", "callout")
        .attr("display", '');
      else
        callout.attr("display", 'none');
    });
  }
};

Template.map.destroyed = function () {
  this.handle && this.handle.stop();
};

///////////////////////////////////////////////////////////////////////////////
// Create HelpEvent dialog

var openCreateDialog = function (x, y) {
  Session.set("createCoords", {x: x, y: y});
  Session.set("createError", null);
  Session.set("showCreateDialog", true);
};

Template.page.showCreateDialog = function () {
  return Session.get("showCreateDialog");
};

Template.createDialog.events({
  'click .save': function (event, template) {
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var points = parseInt(template.find(".points"));
    console.log(typeof(points));
    var expire = new Date(template.find(".expire").value); 
    var loc = template.find(".loc").value;
    var coords = Session.get("createCoords");
    var rewards = template.find(".rewards").value;
    if (title.length && description.length) {
      Meteor.call('createHelpEvent', {
        title: title,
        description: description,
        expire: expire, //template
	points: points, //template
	loc: loc,//	
	x: coords.x,
        y: coords.y,
        rewards : rewards
      }, function (error, helpEvent) {
        if (! error) {
          Session.set("selected", helpEvent);
        }
      });
      Session.set("showCreateDialog", false);
    } else {
      Session.set("createError",
                  "It needs a title and a description, or why bother?");
    }
  },

  'click .cancel': function () {
    Session.set("showCreateDialog", false);
  }
});

Template.createDialog.error = function () {
  return Session.get("createError");
};

///////////////////////////////////////////////////////////////////////////////
// Invite dialog

/*
var openInviteDialog = function () {
  Session.set("showInviteDialog", true);
};

Template.page.showInviteDialog = function () {
  return Session.get("showInviteDialog");
};

Template.inviteDialog.events({
  'click .invite': function (event, template) {
    Meteor.call('invite', Session.get("selected"), this._id);
  },
  'click .done': function (event, template) {
    Session.set("showInviteDialog", false);
    return false;
  }
});

Template.inviteDialog.uninvited = function () {
  var helpEvent = HelpEvents.findOne(Session.get("selected"));
  if (! helpEvent)
    return []; // helpEvent hasn't loaded yet
  return Meteor.users.find({$nor: [{_id: {$in: helpEvent.invited}},
                                   {_id: helpEvent.owner}]});
};

Template.inviteDialog.displayName = function () {
  return displayName(this);
};
*/
