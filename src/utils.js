const https = require('https');

function getImageAssetTypeId(imageExtension) {
    let assetTypeId = '8';

    switch (imageExtension.toLowerCase()) {
        case 'ai':
            assetTypeId = '16';
            break;
        case 'psd':
            assetTypeId = '17';
            break;
        case 'pdd':
            assetTypeId = '18';
            break;
        case 'eps':
            assetTypeId = '19';
            break;
        case 'gif':
            assetTypeId = '20';
            break;
        case 'jpe':
            assetTypeId = '21';
            break;
        case 'jpeg':
            assetTypeId = '22';
            break;
        case 'jpg':
            assetTypeId = '23';
            break;
        case 'jp2':
            assetTypeId = '24';
            break;
        case 'jpx':
            assetTypeId = '25';
            break;
        case 'pict':
            assetTypeId = '26';
            break;
        case 'pct':
            assetTypeId = '27';
            break;
        case 'png':
            assetTypeId = '28';
            break;
        case 'tif':
            assetTypeId = '29';
            break;
        case 'tiff':
            assetTypeId = '30';
            break;
        case 'tga':
            assetTypeId = '31';
            break;
        case 'bmp':
            assetTypeId = '32';
            break;
        case 'wmf':
            assetTypeId = '33';
            break;
        case 'vsd':
            assetTypeId = '34';
            break;
        case 'pnm':
            assetTypeId = '35';
            break;
        case 'pgm':
            assetTypeId = '36';
            break;
        case 'pbm':
            assetTypeId = '37';
            break;
        case 'ppm':
            assetTypeId = '38';
            break;
        case 'svg':
            assetTypeId = '39';
            break;
        default:
            break;
    }
    return assetTypeId;
}

function getDocumentAssetTypeId(docExtension) {
    let assetTypeId = '11';

    switch (docExtension.toLowerCase()) {
        case 'indd':
            assetTypeId = '101';
            break;
        case 'indt':
            assetTypeId = '102';
            break;
        case 'incx':
            assetTypeId = '103';
            break;
        case 'wwcx':
            assetTypeId = '104';
            break;
        case 'doc':
            assetTypeId = '105';
            break;
        case 'docx':
            assetTypeId = '106';
            break;
        case 'dot':
            assetTypeId = '107';
            break;
        case 'dotx':
            assetTypeId = '108';
            break;
        case 'mdb':
            assetTypeId = '109';
            break;
        case 'mpp':
            assetTypeId = '110';
            break;
        case 'ics':
            assetTypeId = '111';
            break;
        case 'xls':
            assetTypeId = '112';
            break;
        case 'xlsx':
            assetTypeId = '113';
            break;
        case 'xlk':
            assetTypeId = '114';
            break;
        case 'xlsm':
            assetTypeId = '115';
            break;
        case 'xlt':
            assetTypeId = '116';
            break;
        case 'xltm':
            assetTypeId = '117';
            break;
        case 'csv':
            assetTypeId = '118';
            break;
        case 'tsv':
            assetTypeId = '119';
            break;
        case 'tab':
            assetTypeId = '120';
            break;
        case 'pps':
            assetTypeId = '121';
            break;
        case 'ppsx':
            assetTypeId = '122';
            break;
        case 'ppt':
            assetTypeId = '123';
            break;
        case 'pptx':
            assetTypeId = '124';
            break;
        case 'pot':
            assetTypeId = '125';
            break;
        case 'thmx':
            assetTypeId = '126';
            break;
        case 'pdf':
            assetTypeId = '127';
            break;
        case 'ps':
            assetTypeId = '128';
            break;
        case 'qxd':
            assetTypeId = '129';
            break;
        case 'rtf':
            assetTypeId = '130';
            break;
        case 'sxc':
            assetTypeId = '131';
            break;
        case 'sxi':
            assetTypeId = '132';
            break;
        case 'sxw':
            assetTypeId = '133';
            break;
        case 'odt':
            assetTypeId = '134';
            break;
        case 'ods':
            assetTypeId = '135';
            break;
        case 'ots':
            assetTypeId = '136';
            break;
        case 'odp':
            assetTypeId = '137';
            break;
        case 'otp':
            assetTypeId = '138';
            break;
        case 'epub':
            assetTypeId = '139';
            break;
        case 'dvi':
            assetTypeId = '140';
            break;
        case 'key':
            assetTypeId = '141';
            break;
        case 'keynote':
            assetTypeId = '142';
            break;
        case 'pez':
            assetTypeId = '143';
            break;
        default:
            break;
    }
    return assetTypeId;
}


async function downloadBase64FromURL(url, access_token, callback) {
    return new Promise((resolve, reject) => {
        https
            .get(
                url,
                { headers: { Authorization: 'Bearer ' + access_token } },
                (resp) => {
                    resp.setEncoding('base64');
                    let imageBody = '';
                    resp.on('data', (data) => {
                        imageBody += data;
                    });
                    resp.on('end', () => {
                        resolve(imageBody);
                    });
                }
            )
            .on('error', (e) => {
                reject(`Got error: ${e.message}`);
            });
    });
}

module.exports = {
    getImageAssetTypeId: function (imageExtension) {
       return getImageAssetTypeId(imageExtension);
    },
    getDocumentAssetTypeId: function (docExtension) {
        return getDocumentAssetTypeId(docExtension);
    },
    downloadBase64FromURL: async function (url, access_token, callback) {
        return await downloadBase64FromURL(url, access_token, callback)
    },
    oauthCallbackUrl : function (request) {
        return request.protocol + "://" + request.get("host");
    }
}