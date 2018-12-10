import Datagrid from './datagrid';

const COLUMN_UPDATE_DELAY = 100;
const DEFAULT_GRID_PAGE_SIZE = 10;

function parseIntOrKeep (val) {
    var result = _.parseInt(val);
    if (_.isNaN(result)) {
        return val;
    }
    return result;
}

function isNullOrUndefined (val) {
    return _.isNull(val) || _.isUndefined(val);
}

const stripEmpties = _.partialRight(_.pick, _.flow(_.identity, _.negate(isNullOrUndefined)));

const getTableOptions = (params) => () => {
    var overrides = stripEmpties({
        paging: params.pageMode,
        pageLength: params.pageSize,
        searching: params.showFilter,
        columnFilter: params.columnFilter
    });

    var tableOptions = {
        tableId: params.tableId,
        addRemoveRow: params.addRemoveRow,
        selectionAndNavigation: params.selectionNavigation,
        overrides: overrides,
        onError: _.bindKey(self, '_wrapAlert'),
        alwaysShowSelection: params.alwaysShowSelection,
        gridHeight: params.gridHeight,
        gridData: params.gridData
    };

    var pageMode = params['pageMode'];

    if (pageMode === 'paged') {
        tableOptions.pagination = 'local';
        tableOptions.paginationSize = params.pageSize || DEFAULT_GRID_PAGE_SIZE;
        tableOptions.paginationElement = $('.hidden-footer-toolbar').get(0); // hide the built-in paginator
    } else if (!pageMode || pageMode === 'none') {
        tableOptions.height = false;
    }

    if (_.isFunction(params.rowFilter)) {
        tableOptions.rowFilter = params.rowFilter;
    }

    tableOptions = stripEmpties(tableOptions);

    if (!_.isUndefined(params.modifier)) {
        if (_.isFunction(params.modifier)) {
            // Pass cloned options so they cannot modify the original table options object
            var modifiedTableOptions = params.modifier(_.cloneDeep(tableOptions));
            if (_.isPlainObject(modifiedTableOptions)) {
                tableOptions = modifiedTableOptions;
            }
        } else {
            // console.error('vdl-table (' + self.tableId + '): "modifier" attribute must be a function.');
        }
    }

    if (tableOptions.addRemoveRow) {
        var isEditable = tableOptions.columnOptions.some(function (column) {
            return !!column.editable;
        });

        if (!isEditable) {
            tableOptions.addRemoveRow = false;
            // not a hard error as this is used as a feature when making a table read only based on permissions
            // console.log('vdl-table (' + self.tableId + "): add/remove rows disabled. Table needs to have at least one editable column to use this feature.");
        }
    }

    return tableOptions;
};

/**
 * VDL Extensions callback.
 *
 * It is this functions responsibility to create the ViewModel that supplies data and behaviour to the <vdlx-datagrid> UI template.
 *
 * @param {object} params - an object where each property is a static or dynamic runtime value for this VDL extension.
 * @param {object} componentInfo - An object containing info describing the component.
 * @param {HTMLElement} componentInfo.element the DOM node for this instance of the VDL extension.
 */
export default function createViewModel(params, componentInfo) {
    // Create the ViewModel object
    var vm = {};

    // Strip off the 'px' units if present.
    if (params.width) {
        vm.tableWidth = params.width.replace('px', '');
    }

    const element = componentInfo.element;
    const defaultScenario = params.scenarioId || 0;

    /**
     * Wrap the options for the
     */
    const tableOptions$ = ko.pureComputed(getTableOptions(params));
    const columnConfig$ = ko.observable({}); 

    var datagrid = new Datagrid(componentInfo.element, tableOptions$, columnConfig$);

    function buildTable () {

        /*
        Collect the column information from the child VDL extensions (vdlx-datagrid-column)
         */
        const columnConfigs = $(element)
            .find('vdlx-datagrid-column')
            .map(function (idx, element) {
                return _.clone(element['autotableConfig']);
            });
        if(!columnConfigs.length) {
            return;
        }

        var entities = [];
        var indices = {};

        _.forEach(columnConfigs, function (configItem) {
            var scenarioNum = parseIntOrKeep(configItem.scenario || defaultScenario);
            if (_.isNumber(scenarioNum)) {
                if (scenarioNum < 0) {
                    // reject('Scenario index must be a positive integer.');
                }
            }
            configItem.scenario = scenarioNum;
            if (!!configItem.entity) {
                configItem.name = configItem.entity;
                delete configItem.entity;
                entities.push(_.omit(configItem, isNullOrUndefined));
            } else if (!!configItem.set) {
                if (!_.has(indices, [configItem.set])) {
                    indices[configItem.set] = [];
                }
                const indexList = indices[configItem.set];
                const cleanItem = _.omit(configItem, isNullOrUndefined);
                const setPosn = configItem.setPosition;
                if (setPosn == null) {
                    indexList.push(cleanItem);
                } else if (indexList[setPosn]) {
                    // reject('Table column for set "' + configItem.set + '" at position ' + setPosn
                    //     + ' specified more than once');
                } else {
                    indexList[setPosn] = cleanItem;
                    // if we have increased the length, then need to
                    // explicitly inserts null/undefined here, or some
                    // standard algorithms behave oddly. (E.g. _.map
                    // will count the missing items, but [].map won't)
                    _.range(indexList.length).forEach(function (j) {
                        if (!indexList[j]) {
                            indexList[j] = null;
                        }
                    });
                }
            } else {
                // reject('Unknown column type');
            }
        });

        var scenarioList = _(entities).filter(function (item) {
            return !isNullOrUndefined(item);
        }).map(function (item) {
            return ko.unwrap(item.scenario);
        }).uniq().sortBy().value();

        if (_.isEmpty(scenarioList) || _.isEmpty(entities)) {
            // console.debug('vdl-table (' + self.tableId + '): Scenario list or table column configuration is empty, ignoring update');

            // if (resolve) {
            //     resolve(tableOptions);
            // }

            // empty table element, to get rid of old configuration
            // $table && $table.empty();
            return;
        }

        columnConfig$({columnOptions: entities, indicesOptions: indices, scenarioList: scenarioList});
    }

    const throttledBuildTable = _.throttle(buildTable, COLUMN_UPDATE_DELAY, { leading: false });

    vm.tableUpdate = function () {
        throttledBuildTable();
    };

    vm.tableValidate = function () {
        debugger;
    };

    vm.validate = function () {
        debugger;
    };

    vm.dispose = function () { };

    buildTable();

    return vm;
}