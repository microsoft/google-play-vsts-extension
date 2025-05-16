// parse command line options
var minimist = require('minimist');
var mopts = {
    string: [
        'server',
        'suite',
        'task',
        'version',
        'testResults',
        'testReporter',
        'testReportLocation'
    ]
};
var options = minimist(process.argv, mopts);

// remove well-known parameters from argv before loading make,
// otherwise each arg will be interpreted as a make target
process.argv = options._;

// modules
var make = require('shelljs/make');
var fs = require('fs');
var path = require('path');
var semver = require('semver');
var util = require('./make-util');

// util functions
var cd = util.cd;
var mkdir = util.mkdir;
var rm = util.rm;
var test = util.test;
var run = util.run;
var banner = util.banner;
var fail = util.fail;
var ensureExists = util.ensureExists;
var buildNodeTask = util.buildNodeTask;
var lintNodeTask = util.lintNodeTask;
var buildPs3TaskAsync = util.buildPs3TaskAsync;
var addPath = util.addPath;
var copyTaskResources = util.copyTaskResources;
var matchFind = util.matchFind;
var matchCopy = util.matchCopy;
var ensureTool = util.ensureTool;
var getExternalsAsync = util.getExternalsAsync;
var createResjson = util.createResjson;
var createTaskLocJson = util.createTaskLocJson;
var validateTask = util.validateTask;
var getTaskNodeVersion = util.getTaskNodeVersion;
var createExtension = util.createExtension;
var installNodeAsync = util.installNodeAsync;

// global paths
var buildPath = path.join(__dirname, '_build', 'Tasks');
var commonPath = path.join(__dirname, '_build', 'Tasks', 'Common');

// core dev-dependencies constants
const constants = require('./dev-dependencies-constants');

const MOCHA_TARGET_VERSION = constants.MOCHA_TARGET_VERSION;
const TSC_CURRENT_VERSION = constants.TSC_CURRENT_VERSION;
const NODE_MIN_VERSION = constants.NODE_MIN_VERSION;
const NPM_MIN_VERSION = constants.NPM_MIN_VERSION;

if (semver.lt(process.versions.node,  NODE_MIN_VERSION)) {
    fail(`requires node >= ${NODE_MIN_VERSION}. installed: ${process.versions.node}`);
}

var supportedNodeTargets = ["Node", "Node10", "Node16", "Node20_1"];

// add node modules .bin to the path so we can dictate version of tsc etc...
var binPath = path.join(__dirname, 'node_modules', '.bin');
if (!test('-d', binPath)) {
    fail('node modules bin not found.  ensure npm install has been run.');
}
addPath(binPath);

// resolve list of tasks
var taskList;
if (options.task) {
    // find using --task parameter
    taskList = matchFind(options.task, path.join(__dirname, 'Tasks'), { noRecurse: true })
        .map(function (item) {
            return path.basename(item);
        });
    if (!taskList.length) {
        fail('Unable to find any tasks matching pattern ' + options.task);
    }
}
else {
    // load the default list
    taskList = JSON.parse(fs.readFileSync(path.join(__dirname, 'make-options.json'))).tasks;
}

target.clean = function () {
    rm('-Rf', path.join(__dirname, '_build'));
    mkdir('-p', buildPath);
    rm('-Rf', path.join(__dirname, '_test'));
};

//
// ex: node make.js build
// ex: node make.js build --task ShellScript
//
target.build = async function() {
    target.clean();

    ensureTool('tsc', '--version', `Version ${TSC_CURRENT_VERSION}`);
    ensureTool('npm', '--version', function (output) {
        if (semver.lt(output, NPM_MIN_VERSION)) {
            fail(`expected ${NPM_MIN_VERSION} or higher`);
        }
    });

    for (var taskName of taskList) {
        banner('Building: ' + taskName);
        var taskPath = path.join(__dirname, 'Tasks', taskName);
        ensureExists(taskPath);

        // load the task.json
        var outDir;
        var shouldBuildNode = test('-f', path.join(taskPath, 'tsconfig.json'));
        var shouldBuildPs3 = false;
        var taskJsonPath = path.join(taskPath, 'task.json');
        if (test('-f', taskJsonPath)) {
            var taskDef = require(taskJsonPath);
            validateTask(taskDef);

            // fixup the outDir (required for relative pathing in legacy L0 tests)
            outDir = path.join(buildPath, taskName);

            // create loc files
            createTaskLocJson(taskPath);
            createResjson(taskDef, taskPath);

            // determine the type of task
            shouldBuildNode = shouldBuildNode || supportedNodeTargets.some(node => taskDef.execution.hasOwnProperty(node));
            shouldBuildPs3 = taskDef.execution.hasOwnProperty('PowerShell3');
        }
        else {
            outDir = path.join(buildPath, path.basename(taskPath));
        }

        mkdir('-p', outDir);

        // get externals
        var taskMakePath = path.join(taskPath, 'make.json');
        var taskMake = test('-f', taskMakePath) ? require(taskMakePath) : {};
        if (taskMake.hasOwnProperty('externals')) {
            console.log('Getting task externals');
            await getExternalsAsync(taskMake.externals, outDir);
        }

        //--------------------------------
        // Common: build, copy, install 
        //--------------------------------
        if (taskMake.hasOwnProperty('common')) {
            var common = taskMake['common'];

            for (var mod of common) {
                var modPath = path.join(taskPath, mod['module']);
                var modName = path.basename(modPath);
                var modOutDir = path.join(commonPath, modName);

                if (!test('-d', modOutDir)) {
                    banner('Building module ' + modPath, true);

                    mkdir('-p', modOutDir);

                    // create loc files
                    var modJsonPath = path.join(modPath, 'module.json');
                    if (test('-f', modJsonPath)) {
                        createResjson(require(modJsonPath), modPath);
                    }

                    // npm install and compile
                    if ((mod.type === 'node' && mod.compile == true) || test('-f', path.join(modPath, 'tsconfig.json'))) {
                        buildNodeTask(modPath, modOutDir);
                    }

                    // copy default resources and any additional resources defined in the module's make.json
                    console.log();
                    console.log('> copying module resources');
                    var modMakePath = path.join(modPath, 'make.json');
                    var modMake = test('-f', modMakePath) ? require(modMakePath) : {};
                    copyTaskResources(modMake, modPath, modOutDir);

                    // get externals
                    if (modMake.hasOwnProperty('externals')) {
                        console.log('Getting module externals');
                        await getExternalsAsync(modMake.externals, modOutDir);
                    }
                }

                // npm install the common module to the task dir
                if (mod.type === 'node' && mod.compile == true) {
                    mkdir('-p', path.join(taskPath, 'node_modules'));
                    rm('-Rf', path.join(taskPath, 'node_modules', modName));
                    var originalDir = pwd();
                    cd(taskPath);
                    run('npm install ' + modOutDir);
                    cd(originalDir);
                }
                // copy module resources to the task output dir
                else if (mod.type === 'ps') {
                    console.log();
                    console.log('> copying module resources to task');
                    var dest;
                    if (mod.hasOwnProperty('dest')) {
                        dest = path.join(outDir, mod.dest, modName);
                    }
                    else {
                        dest = path.join(outDir, 'ps_modules', modName);
                    }

                    matchCopy('!Tests', modOutDir, dest, { noRecurse: true });
                }
            }
        }

        // build Node task
        if (shouldBuildNode) {
            buildNodeTask(taskPath, outDir);
            lintNodeTask(taskPath, outDir);
        }

        // build PowerShell3 task
        if (shouldBuildPs3) {
            await buildPs3TaskAsync(taskPath, outDir);
        }

        // copy default resources and any additional resources defined in the task's make.json
        console.log();
        console.log('> copying task resources');
        copyTaskResources(taskMake, taskPath, outDir);
    }

    banner('Build successful', true);
}

//
// will run tests for the scope of tasks being built
// npm test
// node make.js test
// node make.js test --task ShellScript --suite L0
//
target.test = async function() {
    process.env['SYSTEM_DEBUG'] = 'true';

    ensureTool('tsc', '--version', `Version ${TSC_CURRENT_VERSION}`);
    ensureTool('mocha', '--version', MOCHA_TARGET_VERSION);

    // run the tests
    var suiteType = options.suite || 'L0';
    async function runTaskTestsAsync(taskName) {
        banner('Testing: ' + taskName);
        // find the tests
        var nodeVersion = options.node || getTaskNodeVersion(buildPath, taskName) + "";
        var pattern1 = path.join(buildPath, taskName, 'Tests', suiteType + '.js');
        var pattern2 = path.join(buildPath, 'Common', taskName, 'Tests', suiteType + '.js');

        var testsSpec = [];

        if (fs.existsSync(pattern1)) {
            testsSpec.push(pattern1);
        }
        if (fs.existsSync(pattern2)) {
            testsSpec.push(pattern2);
        }

        if (testsSpec.length == 0) {
            console.warn(`Unable to find tests using the following patterns: ${JSON.stringify([pattern1, pattern2])}`);
            return;
        }
        // setup the version of node to run the tests
        await installNodeAsync(nodeVersion);

        run('mocha ' + testsSpec.join(' ') /*+ ' --reporter mocha-junit-reporter --reporter-options mochaFile=../testresults/test-results.xml'*/, /*inheritStreams:*/true);
    }

    if (options.task) {
        await runTaskTestsAsync(options.task);
    } else {
        // Run tests for each task that exists
        for (var taskName of taskList) {
            var taskPath = path.join(buildPath, taskName);
            if (fs.existsSync(taskPath)) {
                await runTaskTestsAsync(taskName);
            }
        }

        banner('Running common library tests');
        var commonLibPattern = path.join(buildPath, 'Common', '*', 'Tests', suiteType + '.js');
        var specs = [];
        if (matchFind(commonLibPattern, buildPath).length > 0) {
            specs.push(commonLibPattern);
        }
        if (specs.length > 0) {
            // setup the version of node to run the tests
            await installNodeAsync(options.node);
            run('mocha ' + specs.join(' ') /*+ ' --reporter mocha-junit-reporter --reporter-options mochaFile=../testresults/test-results.xml'*/, /*inheritStreams:*/true);
        } else {
            console.warn("No common library tests found");
        }
    }
}

target.create = function() {
    banner('Creating PRODUCTION vsix...');

    var prodManifestOverride = {
        public: true
    };

    createExtension(prodManifestOverride, false);
}

target.createtest = function() {
    banner('Creating TEST vsix...');

    var createtestOverride = { 
        public: false,
        name: "Google Play-Dev", 
        id: "google-play-dev", 
        publisher: "ms-vsclient"
    };

    createExtension(createtestOverride, false);
}

target.publishtest = function() {
    banner('Creating and publishing TEST vsix...');

    var createPublishOverride = { 
        public: false,
        name: "Google Play-Dev", 
        id: "google-play-dev", 
        publisher: "ms-vsclient"
    };

    createExtension(createPublishOverride, true);
}
