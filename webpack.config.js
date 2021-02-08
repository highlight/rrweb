const path = require('path');
const webpack = require('webpack'); //to access built-in plugins

module.exports = {
    entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        library: 'highlightLib',
        libraryTarget: 'umd',
    },
    devServer: {
        watchContentBase: true,
        writeToDisk: true,
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
    },
    devServer: {
        contentBase: path.join(__dirname, 'dist'),
        port: 8083
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader'
                ]
            }
        ],
    },
    resolve: {
        extensions: ['.js', '.ts', '.tsx'],
        modules: [path.resolve(__dirname, 'src'), 'node_modules'],
        // NOTE: Only uncomment for experimenting with rrweb-snapshot.
        // alias: {
        //     "rrweb-snapshot": path.resolve(__dirname, "../rrweb-snapshot/dist"),
        // },
    },
    mode: 'development',
    devtool: 'source-map',
};
