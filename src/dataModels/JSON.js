'use strict';

var analytics = require('hyper-analytics');
//var analytics = require('../local_node_modules/hyper-analytics');
//var analytics = require('../local_node_modules/finanalytics');
var DataModel = require('./DataModel');
var images = require('../../images');
var CustomFilter = require('../lib/CustomFilter');

var UPWARDS_BLACK_ARROW = '\u25b2', // aka '▲'
    DOWNWARDS_BLACK_ARROW = '\u25bc'; // aka '▼'

var nullDataSource = {
    isNullObject: function() {
        return true;
    },
    getFields: function() {
        return [];
    },
    getHeaders: function() {
        return [];
    },
    getColumnCount: function() {
        return 0;
    },
    getRowCount: function() {
        return 0;
    },
    getAggregateTotals: function() {
        return [];
    },
    hasAggregates: function() {
        return false;
    },
    hasGroups: function() {
        return false;
    },
    getRow: function() {
        return null;
    }
};

/**
 * @name dataModels.JSON
 * @constructor
 */
var JSON = DataModel.extend('dataModels.JSON', {

    //null object pattern for the source object
    source: nullDataSource,

    preglobalfilter: nullDataSource,

    presorter: nullDataSource,
    analytics: nullDataSource,
    postglobalfilter: nullDataSource,
    postsorter: nullDataSource,

    topTotals: [],
    bottomTotals: [],

    initialize: function() {
        this.selectedData = [];
    },

    clearSelectedData: function() {
        this.selectedData.length = 0;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {boolean}
     */
    hasAggregates: function() {
        return this.analytics.hasAggregates();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {boolean}
     */
    hasGroups: function() {
        return this.analytics.hasGroups();
    },

    getDataSource: function() {
        return this.postsorter; //this.hasAggregates() ? this.analytics : this.presorter;
    },

    getGlobalFilterDataSource: function() {
        return this.postglobalfilter; //this.hasAggregates() ? this.postfilter : this.prefilter;
    },

    getSortDataSource: function() {
        return this.postsorter; //this.hasAggregates() ? this.postsorter : this.presorter;
    },

    getData: function() {
        return this.source.data;
    },

    getFilteredData: function() {
        var ds = this.getDataSource();
        var count = ds.getRowCount();
        var result = new Array(count);
        for (var y = 0; y < count; y++) {
            result[y] = ds.getRow(y);
        }
        return result;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} x
     * @param {number} y
     * @returns {*}
     */
    getValue: function(x, y) {
        var hasHierarchyColumn = this.hasHierarchyColumn();
        var headerRowCount = this.grid.getHeaderRowCount();
        var value;
        if (hasHierarchyColumn) {
            if (x === -2) {
                x = 0;
            }
        } else if (this.hasAggregates()) {
            x += 1;
        }
        if (y < headerRowCount) {
            value = this.getHeaderRowValue(x, y);
            return value;
        }
        // if (hasHierarchyColumn) {
        //     y += 1;
        // }
        value = this.getDataSource().getValue(x, y - headerRowCount);
        return value;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} x
     * @param {number} y - negative values refer to _bottom totals_ rows
     * @returns {*}
     */
    getHeaderRowValue: function(x, y) {
        var value;
        if (y === undefined) {
            value = this.getHeaders()[Math.max(x, 0)];
        } else if (y < 0) { // bottom totals rows
            var bottomTotals = this.getBottomTotals();
            value = bottomTotals[bottomTotals.length + y][x];
        } else {
            var isFilterRow = this.grid.isShowFilterRow(),
                isHeaderRow = this.grid.isShowHeaderRow(),
                topTotalsOffset = (isFilterRow ? 1 : 0) + (isHeaderRow ? 1 : 0);
            if (y >= topTotalsOffset) { // top totals rows
                value = this.getTopTotals()[y - topTotalsOffset][x];
            } else if (isHeaderRow && y === 0) {
                value = this.getHeaders()[x];
                var sortString = this.getSortImageForColumn(x);
                if (sortString) { value = sortString + value; }
            } else { // must be filter row
                var filter = this.getGlobalFilter();
                value = filter ? filter.getColumnFilterState(this.getFields()[x]) : '';
                var icon = images.filter(value.length);
                return [null, value, icon];
            }
        }
        return value;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} x
     * @param {number} y
     * @param value
     */
    setValue: function(x, y, value) {
        var hasHierarchyColumn = this.hasHierarchyColumn();
        var headerRowCount = this.grid.getHeaderRowCount();
        if (hasHierarchyColumn) {
            if (x === -2) {
                x = 0;
            }
        } else if (this.hasAggregates()) {
            x += 1;
        }
        if (y < headerRowCount) {
            this.setHeaderRowValue(x, y, value);
        } else {
            this.getDataSource().setValue(x, y - headerRowCount, value);
        }
        this.changed();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} x
     * @param {number} y
     * @param value
     * @returns {*}
     */
    setHeaderRowValue: function(x, y, value) {
        if (value === undefined) {
            return this._setHeader(x, y); // y is really the value
        }
        var isFilterRow = this.grid.isShowFilterRow();
        var isHeaderRow = this.grid.isShowHeaderRow();
        var isBoth = isFilterRow && isHeaderRow;
        var topTotalsOffset = (isFilterRow ? 1 : 0) + (isHeaderRow ? 1 : 0);
        if (y >= topTotalsOffset) {
            this.getTopTotals()[y - topTotalsOffset][x] = value;
        } else if (x === -1) {
            return; // can't change the row numbers
        } else if (isBoth) {
            if (y === 0) {
                return this._setHeader(x, value);
            } else {
                this.setFilter(x, value);
            }
        } else if (isFilterRow) {
            this.setFilter(x, value);
        } else {
            return this._setHeader(x, value);
        }
        return '';
    },

    setFilter: function(x, value) {
        var filter = this.getGlobalFilter(),
            columnName = this.getFields()[x];

        filter.setColumnFilterState(columnName, value);
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} colIndex
     * @returns {*}
     */
    getColumnProperties: function(colIndex) {
        //access directly because we want it ordered
        var column = this.grid.behavior.allColumns[colIndex];
        if (column) {
            return column.getProperties();
        }
        return undefined;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {number}
     */
    getColumnCount: function() {
        var showTree = this.grid.resolveProperty('showTreeColumn') === true;
        var hasAggregates = this.hasAggregates();
        var offset = (hasAggregates && !showTree) ? -1 : 0;
        return this.analytics.getColumnCount() + offset;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {number}
     */
    getRowCount: function() {
        var count = this.getDataSource().getRowCount();
        count += this.grid.getHeaderRowCount();
        return count;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {string[]}
     */
    getHeaders: function() {
        return this.analytics.getHeaders();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {string[]} headers
     */
    setHeaders: function(headers) {
        this.getDataSource().setHeaders(headers);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {string[]} fields
     */
    setFields: function(fields) {
        this.getDataSource().setFields(fields);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {string[]}
     */
    getFields: function() {
        return this.getDataSource().getFields();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {object[]} dataRows
     */
    setData: function(dataRows) {
        this.source = new analytics.JSDataSource(dataRows);
        //this.preglobalfilter = new analytics.DataSourceGlobalFilter(this.source);
        //this.presorter = new analytics.DataSourceSorterComposite(this.prefilter);

        this.analytics = new analytics.DataSourceAggregator(this.source);

        this.postglobalfilter = new analytics.DataSourceGlobalFilter(this.analytics);
        this.postsorter = new analytics.DataSourceSorterComposite(this.postglobalfilter);

        this.applyAnalytics();

    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {Array<Array>} totalRows
     */
    setTopTotals: function(totalRows) {
        this.topTotals = totalRows;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {Array<Array>}
     */
    getTopTotals: function() {
        return this.hasAggregates() ? this.getDataSource().getGrandTotals() : this.topTotals;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {Array<Array>} totalRows
     */
    setBottomTotals: function(totalRows) {
        this.bottomTotals = totalRows;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {Array<Array>}
     */
    getBottomTotals: function() {
        return this.hasAggregates() ? this.getDataSource().getGrandTotals() : this.bottomTotals;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param groups
     */
    setGroups: function(groups) {
        this.analytics.setGroupBys(groups);
        this.applyAnalytics();
        this.grid.fireSyntheticGroupsChangedEvent(this.getGroups());
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {object[]}
     */
    getGroups: function() {
        var headers = this.getHeaders().slice(0);
        var fields = this.getFields().slice(0);
        var groupBys = this.analytics.groupBys;
        var groups = [];
        for (var i = 0; i < groupBys.length; i++) {
            var field = headers[groupBys[i]];
            groups.push({
                id: groupBys[i],
                label: field,
                field: fields
            });
        }
        return groups;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {object[]}
     */
    getAvailableGroups: function() {
        var headers = this.source.getHeaders().slice(0);
        var groupBys = this.analytics.groupBys;
        var groups = [];
        for (var i = 0; i < headers.length; i++) {
            if (groupBys.indexOf(i) === -1) {
                var field = headers[i];
                groups.push({
                    id: i,
                    label: field,
                    field: field
                });
            }
        }
        return groups;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {object[]}
     */
    getVisibleColumns: function() {
        var items = this.grid.behavior.columns;
        items = items.filter(function(each) {
            return each.label !== 'Tree';
        });
        return items;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {object[]}
     */
    getHiddenColumns: function() {
        var visible = this.grid.behavior.columns;
        var all = this.grid.behavior.allColumns;
        var hidden = [];
        for (var i = 0; i < all.length; i++) {
            if (visible.indexOf(all[i]) === -1) {
                hidden.push(all[i]);
            }
        }
        hidden.sort(function(a, b) {
            return a.label < b.label;
        });
        return hidden;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param aggregations
     */
    setAggregates: function(aggregations) {
        this.quietlySetAggregates(aggregations);
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param aggregations
     */
    quietlySetAggregates: function(aggregations) {
        this.analytics.setAggregates(aggregations);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @returns {boolean}
     */
    hasHierarchyColumn: function() {
        var showTree = this.grid.resolveProperty('showTreeColumn') === true;
        return this.hasAggregates() && this.hasGroups() && showTree;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     */
    applyAnalytics: function(dontApplyGroupBysAndAggregations) {
        selectedDataRowsBackingSelectedGridRows.call(this);

        if (!dontApplyGroupBysAndAggregations) {
            applyGroupBysAndAggregations.call(this);
        }

        applyFilters.call(this);

        applySorts.call(this);

        reselectGridRowsBackedBySelectedDataRows.call(this);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} colIndex
     * @param keys
     */
    toggleSort: function(colIndex, keys) {
        this.incrementSortState(colIndex, keys);
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} colIndex
     * @param {string[]} keys
     */
    incrementSortState: function(colIndex, keys) {
        colIndex++; //hack to get around 0 index
        var state = this.getPrivateState();
        var hasCTRL = keys.indexOf('CTRL') > -1;
        state.sorts = state.sorts || [];
        var already = state.sorts.indexOf(colIndex);
        if (already === -1) {
            already = state.sorts.indexOf(-1 * colIndex);
        }
        if (already > -1) {
            if (state.sorts[already] > 0) {
                state.sorts[already] = -1 * state.sorts[already];
            } else {
                state.sorts.splice(already, 1);
            }
        } else if (hasCTRL || state.sorts.length === 0) {
            state.sorts.unshift(colIndex);
        } else {
            state.sorts.length = 0;
            state.sorts.unshift(colIndex);
        }
        if (state.sorts.length > 3) {
            state.sorts.length = 3;
        }
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param index
     * @param returnAsString
     * @returns {*}
     */
    getSortImageForColumn: function(index) {
        index++;
        var up = true;
        var sorts = this.getPrivateState().sorts;
        if (!sorts) {
            return null;
        }
        var position = sorts.indexOf(index);
        if (position < 0) {
            position = sorts.indexOf(-1 * index);
            up = false;
        }
        if (position < 0) {
            return null;
        }
        var rank = sorts.length - position;
        var arrow = up ? UPWARDS_BLACK_ARROW : DOWNWARDS_BLACK_ARROW;
        return rank + arrow + ' ';
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param cell
     * @param event
     */
    cellClicked: function(cell, event) {
        if (!this.hasAggregates()) {
            return;
        }
        if (event.gridCell.x !== 0) {
            return; // this wasn't a click on the hierarchy column
        }
        var headerRowCount = this.grid.getHeaderRowCount();
        var y = event.gridCell.y - headerRowCount;
        this.getDataSource().click(y);
        this.applyAnalytics(true);
        this.changed();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} y
     * @returns {object}
     */
    getRow: function(y) {
        var headerRowCount = this.grid.getHeaderRowCount();
        if (y < headerRowCount && !this.hasAggregates()) {
            var topTotals = this.getTopTotals();
            return topTotals[y - (headerRowCount - topTotals.length)];
        }
        return this.getDataSource().getRow(y - headerRowCount);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} y
     * @returns {object}
     */
    buildRow: function(y) {
        var colCount = this.getColumnCount();
        var fields = [].concat(this.getFields());
        var result = {};
        if (this.hasAggregates()) {
            result.tree = this.getValue(-2, y);
            fields.shift();
        }
        for (var i = 0; i < colCount; i++) {
            result[fields[i]] = this.getValue(i, y);
        }
        return result;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {number} y
     * @returns {object}
     */
    getComputedRow: function(y) {
        var rcf = this.getRowContextFunction([y]);
        var fields = this.getFields();
        var row = {};
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            row[field] = rcf(field)[0];
        }
        return row;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {string} fieldName
     * @param {number} y
     * @returns {*}
     */
    getValueByField: function(fieldName, y) {
        var index = this.getFields().indexOf(fieldName);
        if (this.hasAggregates()) {
            y += 1;
        }
        return this.getDataSource().getValue(index, y);
    },

    getGlobalFilter: function() {
        return this.getGlobalFilterDataSource().get();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {FilterTree|FilterTreeOptionsObject} [filterOrOptions] - One of:
     * * `FilterTree` - an existing filter-tree
     * * `FilterTreeOptionsObject` - an options object for the creation of a new filter-tree
     * * falsy (omitted) - Turns off filtering.
     */
    setGlobalFilter: function(filterOrOptions) {
        var dataSource = this.getGlobalFilterDataSource();

        if (!filterOrOptions) {
            dataSource.clear();
        } else {
            var filter;

            if (filterOrOptions instanceof CustomFilter) {
                filter = filterOrOptions;
            } else {
                filter = new CustomFilter(filterOrOptions);

                // TODO: Remove this (just for testing):
                if (false) { // eslint-disable-line no-constant-condition
                    filter.children[1].add({
                        children: [{
                            column: 'total_number_of_pets_owned',
                            operator: '=',
                            literal: '3'
                        }],
                        type: 'columnFilter'
                    });
                }

                filter.invalid();
            }

            dataSource.set(filter);
        }

        this.applyAnalytics();
    },

    setGlobalFilterCaseSensitivity: function(isSensitive) {
        this.getGlobalFilter().setCaseSensitivity(isSensitive);
    },

    /**
     * @memberOf dataModels.JSON.prototype
     * @param {object} config
     * @param {number} x
     * @param {number} y
     * @param {number} untranslatedX
     * @param {number} untranslatedY
     * @returns {object}
     */
    getCellRenderer: function(config, x, y, untranslatedX, untranslatedY) {
        var renderer;
        var provider = this.grid.getCellProvider();

        config.x = x;
        config.y = y;
        config.untranslatedX = untranslatedX;
        config.untranslatedY = untranslatedY;

        renderer = provider.getCell(config);
        renderer.config = config;

        return renderer;
    },

    /**
     * @memberOf dataModels.JSON.prototype
     */
    applyState: function() {
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.JSON.prototype
     */
    reset: function() {
        this.setData([]);
    },

    getUnfilteredValue: function(x, y) {
        return this.source.getValue(x, y);
    },

    getUnfilteredRowCount: function() {
        return this.source.getRowCount();
    },

});

// LOCAL METHODS -- to be called with `.call(this`

/**
 * Accumulate actual data row objects backing current grid row selections.
 * This call should be paired with a subsequent call to `reselectGridRowsBackedBySelectedDataRows`.
 * @private
 * @memberOf dataModels.JSON.prototype
 */
function selectedDataRowsBackingSelectedGridRows() {
    var selectedData = this.selectedData,
        hasRowSelections = this.grid.selectionModel.hasRowSelections(),
        needFilteredDataList = selectedData.length || hasRowSelections;

    if (needFilteredDataList) {
        var filteredData = this.getFilteredData();
    }

    // STEP 1: Remove any filtered data rows from the recently selected list.
    selectedData.forEach(function(dataRow, index) {
        if (filteredData.indexOf(dataRow) >= 0) {
            delete selectedData[index];
        }
    });

    // STEP 2: Accumulate the data rows backing any currently selected grid rows in `this.selectedData`.
    if (hasRowSelections) { // any current grid row selections?
        this.grid.getSelectedRows().forEach(function(selectedRowIndex) {
            var dataRow = filteredData[selectedRowIndex];
            if (selectedData.indexOf(dataRow) < 0) {
                selectedData.push(dataRow);
            }
        });
    }
}

/**
 * Re-establish grid row selections based on actual data row objects accumulated by `selectedDataRowsBackingSelectedGridRows` which should be called first.
 * @private
 * @memberOf dataModels.JSON.prototype
 */
function reselectGridRowsBackedBySelectedDataRows() {
    if (this.selectedData.length) { // any data row objects added from previous grid row selections?
        var selectionModel = this.grid.selectionModel,
            offset = this.grid.getHeaderRowCount(),
            filteredData = this.getFilteredData();

        selectionModel.clearRowSelection();

        this.selectedData.forEach(function(dataRow) {
            var index = filteredData.indexOf(dataRow);
            if (index >= 0) {
                selectionModel.selectRow(offset + index);
            }
        });
    }
}

/**
 * @private
 * @memberOf dataModels.JSON.prototype
 */
function applyGroupBysAndAggregations() {
    if (this.analytics.aggregates.length === 0) {
        this.quietlySetAggregates({});
    }
    this.analytics.apply();
}

/**
 * @private
 * @memberOf dataModels.JSON.prototype
 */
function applyFilters() {
    this.getGlobalFilterDataSource().apply();

    var details = [];

    // TODO: return something useful...
    // was previously returning, for each column in this.getVisibleColumns():
    // [ { column: column.label, format: 'complex' or column.getProperties().format }, ... ]


    this.grid.fireSyntheticFilterAppliedEvent({
        details: details
    });
}

/**
 * @private
 * @memberOf dataModels.JSON.prototype
 */
function applySorts() {
    var sortingSource = this.getSortDataSource();
    var sorts = this.getPrivateState().sorts;
    var groupOffset = this.hasAggregates() ? 1 : 0;
    if (!sorts || sorts.length === 0) {
        sortingSource.clearSorts();
    } else {
        for (var i = 0; i < sorts.length; i++) {
            var colIndex = Math.abs(sorts[i]) - 1;
            var type = sorts[i] < 0 ? -1 : 1;
            sortingSource.sortOn(colIndex - groupOffset, type);
        }
    }
    sortingSource.applySorts();
}

module.exports = JSON;