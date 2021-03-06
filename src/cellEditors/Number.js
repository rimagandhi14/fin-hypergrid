'use strict';

var Textfield = require('./Textfield');
var localization = require('../lib/localization');

/**
 * @constructor
 */
var Number = Textfield.extend('Number', {

    template: function() {
        /*
         <input type="text">
         */
    },

    localizer: localization.get('number')

});

module.exports = Number;
