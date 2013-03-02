// All Tomorrow's events -- data model
// Loaded on both the client and the server

///////////////////////////////////////////////////////////////////////////////
// events

/*
 Each event is represented by a document in the Events collection:
 owner: user id
 x, y: Number (screen coordinates in the interval [0, 1])
 title, description, rewards, location: String
 point: int
 expire: int
 helpers: Array of userId
 */

Events = new Meteor.Collection("events");

Events.allow({
  insert: function (userId, event) {
    return false; // no cowboy inserts -- use createevent method
  },
  update: function (userId, events, fields, modifier) {
    return _.all(events, function (event) {
      if (userId !== event.owner)
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
  remove: function (userId, events) {
    return ! _.any(events, function (event) {
      // deny if not the owner, or if other people are going
      return event.owner !== userId || attending(event) > 0;
    });
  }
});

var attending = function (event) {
  return event.helpers.length;
};

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

    return Events.insert({
      owner: this.userId,
      x: options.x,
      y: options.y,
      rewards: options.rewards,
      location: options.location,
      point : options.point,
      expire: options.expire,  
      title: options.title,
      description: options.description,
      helpers:[]
    });
  },

   gotoHelp: function (eventId) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to offer helps");
    var event = Events.findOne(eventId);
    if (! event)
      throw new Meteor.Error(404, "No such event");
    if (! event.owner !== this.userId &&
        !_.contains(event.invited, this.userId))
      // private, but let's not tell this to the user
      throw new Meteor.Error(403, "No such event");

    var rsvpIndex = _.indexOf(_.pluck(event.rsvps, 'user'), this.userId);
    if (rsvpIndex !== -1) {
      // update existing rsvp entry

      if (Meteor.isServer) {
        // update the appropriate rsvp entry with $
        events.update(
          {_id: eventId, "rsvps.user": this.userId},
          {$set: {"rsvps.$.rsvp": rsvp}});
      } else {
        // minimongo doesn't yet support $ in modifier. as a temporary
        // workaround, make a modifier that uses an index. this is
        // safe on the client since there's only one thread.
        var modifier = {$set: {}};
        modifier.$set["rsvps." + rsvpIndex + ".rsvp"] = rsvp;
        events.update(eventId, modifier);
      }

      // Possible improvement: send email to the other people that are
      // coming to the event.
    } else {
      // add new rsvp entry
      events.update(eventId,
                     {$push: {rsvps: {user: this.userId, rsvp: rsvp}}});
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// Users

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
};
