var gulp = require('gulp');
var PluginError = require('plugin-error');
var child_process = require('child_process');
var process = require('process');
var exec  = require('child_process').exec;
var path = require('path');
var fs = require('fs');
var argv = require('yargs').argv;
var del = require('del');

function make (target, cb) {
    var cl = ('node make.js ' + target + ' ' + process.argv.slice(3).join(' ')).trim();
    console.log('------------------------------------------------------------');
    console.log('> ' + cl);
    console.log('------------------------------------------------------------');
    try {
        child_process.execSync(cl, { cwd: __dirname, stdio: 'inherit' });
    } catch (err) {
        var msg = err.output ? err.output.toString() : err.message;
        console.error(msg);
        cb(new PluginError(msg));
        return false;
    }

    cb();
    return true;
}

gulp.task('clean', gulp.series(function (done) {
    return del(['_build/**', '_results/**'], done);
}));

gulp.task('build', gulp.series('clean', function (cb) {
    make('build', cb);
}));

gulp.task('test', gulp.series(function (cb) {
    make('test', cb);
}));

gulp.task('default', gulp.series('build'));

var createProdOverride = { 
    public: true
};

var createtestOverride = { 
    public: false,
    name: "Google Play-Dev", 
    id: "vso-extension-android-dev", 
    publisher: "ms-mobiledevops-test"
};

var createPublishOverride = { 
    public: false,
    name: "Google Play-Dev", 
    id: "vso-extension-android-dev", 
    publisher: "ms-mobiledevops-test"
};

gulp.task('installtaskdeps', gulp.series(function (cb) {
    console.log('Installing task dependencies...');

    var rootPath = process.cwd(); 
    var tasksPath = path.join(rootPath, 'Tasks');
    var tasks = fs.readdirSync(tasksPath);
    console.log(tasks.length + ' tasks found.')
    tasks.forEach(function(task) {
        console.log('Processing task ' + task);
        process.chdir(path.join(tasksPath,task));

        console.log('Installing PRODUCTION npm dependencies for task (' + task + ')...');

        exec('npm install --only=prod', function (err, stdout, stderr) {
            console.log(stdout);
            console.log(stderr);
            if (err) {
                cb(err);
            }
        });
    });
    process.chdir(rootPath);

    cb();
}));

function toOverrideString(object) {
    return JSON.stringify(object).replace(/"/g, '\\"');
}

gulp.task('cleanpackagefiles', gulp.series(function (done) {
    return del(['_build/Tasks/**/Tests', '_build/Tasks/**/*.js.map', '_build/Tasks/**/*.d.ts'], done);
}));

gulp.task('create', gulp.series('installtaskdeps', 'cleanpackagefiles', function (cb) {
    console.log('Creating PRODUCTION vsix...');
    exec('tfx extension create --manifest-globs vsts-extension-google-play.json --override ' + toOverrideString(createProdOverride), function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}));

gulp.task('createtest', gulp.series('installtaskdeps', 'cleanpackagefiles', function (cb) {
    console.log('"Creating Test VSIX...');
    exec('tfx extension create --manifest-globs vsts-extension-google-play.json --override ' + toOverrideString(createtestOverride) + ' --share-with mobiledevops x04ty29er --token $PUBLISH_ACCESSTOKEN', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}));

gulp.task('publishtest', gulp.series('installtaskdeps', 'cleanpackagefiles', function (cb) {
    console.log('Creating and publishing test VSIX...');
    exec('tfx extension create --manifest-globs vsts-extension-google-play.json --override ' + toOverrideString(createPublishOverride) + '--share-with mobiledevops x04ty29er --token $PUBLISH_ACCESSTOKEN', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}));

// Default to list reporter when run directly.
// CI build can pass '--reporter=junit' to create JUnit results files
var reporter = 'list';
var reporterLocation = '';
if (argv.reporter === "junit") {
    reporter = 'mocha-junit-reporter';
    reporterLocation = '_results/test-results.xml';
}

// gulp testwithresults --reporter junit
gulp.task('testwithresults', gulp.series(function (cb) {
    console.log('Running tests and publishing test results...');
    var cmdline = 'test --testResults true --testReporter ' + reporter;
    if (reporterLocation) {
        cmdline += ' --testReportLocation ' + reporterLocation;
    }
    make(cmdline, cb);
}));
