// All Tomorrow's HelpEvents -- data model
// Loaded on both the client and the server

///////////////////////////////////////////////////////////////////////////////
// HelpEvents

/*
 Each event is represented by a document in the HelpEvents collection:
 owner: user id
 x, y: Number (screen coordinates in the interval [0, 1])
 title, description, rewards, location: String
 point: int
 expire: int
 helpers: Array of userId
 */

HelpEvents = new Meteor.Collection("helpEvents");

HelpEvents.allow({
  insert: function (userId, help_event) {
    return false; // no cowboy inserts -- use createEvent method
  },
  update: function (userId, helpEvents, fields, modifier) {
    return _.all(helpEvents, function (helpEvent) {
      if (userId !== helpEvent.owner)
        return false; // not the owner

      var allowed = ["title", "location", "rewards", "expire", "point", "description", "x", "y"];
      if (_.difference(fields, allowed).length)
        return false; // tried to write to forbidden field

      // A good improvement would be to validate the type of the new
      // value of the field (and if a string, the length.) In the
      // future Meteor will have a schema system to makes that easier.
      return true;
    });
  },
  remove: function (userId, helpEvents) {
    return ! _.any(HelpEvents, function (helpEvent) {
      // deny if not the owner, or if other people are going
      return helpEvent.owner !== userId || attending(helpEvent) > 0;
    });
  }
});

/*
var attending = function (helpEvent) {
  return helpEvent.helpers.length;
};
*/

Meteor.methods({
  // options should include: title, description, x, y, public
  createEvent: function (options) {
    options = options || {};
    if (! (typeof options.title === "string" && options.title.length &&
           typeof options.description === "string" &&
           options.description.length &&
           typeof options.expire==="number" && options.expire>=0 &&
           typeof options.point==="number" && options.point>=0 &&
           typeof options.location === "string" && options.location.length &&
           typeof options.x === "number" && options.x >= 0 && options.x <= 1 &&
           typeof options.y === "number" && options.y >= 0 && options.y <= 1))
      throw new Meteor.Error(400, "Required parameter missing");
    if (options.title.length > 100)
      throw new Meteor.Error(413, "Title too long");
    if (options.description.length > 1000)
      throw new Meteor.Error(413, "Description too long");
    if (options.location.length>100)
	throw new Meteor.Error(413, "Location too long");
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in");

    return HelpEvents.insert({
      owner: this.userId,
      x: options.x,
      y: options.y,
      rewards: options.rewards,
      location: options.location,
      point : options.point,
      expire: options.expire,  
      title: options.title,
      description: options.description,
      helpers: []
    });
  },

   gotoHelp: function (helpEventId) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to offer helps");
    var helpEvent = HelpEvents.findOne(helpEventId);
    if (! helpEvent)
      throw new Meteor.Error(404, "No such event");
    if (this.userId==helpEvent.owner)
      throw new Meteor.Error(404, "You could not help you self"); 
    if (_.contains(helpEvent.helpers,this.userId))
      throw new Meteor.Error(404, "You are going to help");
      // add new helpers entry
      HelpEvents.update(helpEventId,
                     {$push: {helpers :this.userId}});
  }
});

///////////////////////////////////////////////////////////////////////////////
// Users
/*
var displayName = function (user) {
  if (user.profile && user.profile.name)
    return user.profile.name;
  return user.emails[0].address;
};

var contactEmail = function (user) {
  if (user.emails && user.emails.length)
    return user.emails[0].address;
  if (user.services && user.services.facebook && user.services.facebook.email)
    return user.services.facebook.email;
  return null;
};*/
