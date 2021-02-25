const { getMcFolders, createMcFolder, getMcAuth } = require('../mcUtils.js');
const fetch = require('node-fetch');

const { validateUrl } = require('./utils.js');

const { MC_FOLDER_NAME, MC_REST_BASE_URI } = process.env;
const {
    MC_CONTENT_CATEGORIES_API_PATH,
    MC_AUTH_FAILED_MSG,
    MC_FOLDER_CREATION_FAILED_MSG,
    SF_AUTH_FAILED_MSG

} = require('../constants');



 async function getIdFromServer() {
    try {
        const folderName = MC_FOLDER_NAME || 'CMS Connect Folder'; // Env folder name
        const mcAuthResults = await getMcAuth();
        if (mcAuthResults && mcAuthResults.access_token) {
            const mcFolders = await getMcFolders(mcAuthResults.access_token); // Getting all folders

            if (mcFolders && mcFolders.items) {
                const matchedFolder = [...mcFolders.items].find(ele => ele.name === folderName); // Check is folder already created or not
                if (!matchedFolder) {
                    //Create folder in MC
                    const parentFolder = [...mcFolders.items].find(ele => ele.parentId === 0);
                    if (parentFolder && parentFolder.id) {
                        const createdFolder = await createMcFolder(parentFolder.id, mcAuthResults.access_token);
                        if (createdFolder.errorcode) {
                            return { status: 500, errorMsg: `Error in folder creation: ${createdFolder.message}` };
                        } else {
                            const id = createdFolder ? createdFolder.id : null;
                            const status = 200;
                            return { id, status };
                        }
                    } else {
                        return { status: 500, errorMsg: MC_NO_PARENT_FOLDER_MSG };
                    }
                } else {
                    const id = matchedFolder.id ? matchedFolder.id : null;
                    const status = 200;
                    return { id, status };
                }
            } else {
                return { status: 500, errorMsg: MC_FOLDER_CREATION_FAILED_MSG };
            }
        } else {
            return { status: 401, errorMsg: MC_AUTH_FAILED_MSG };
        }
    } catch (error) {
        return { status: 500, errorMsg: `${error.message}` };
    }
}
module.exports = {
    /**
     * Method return folder id from mc if folder is not created.
     * @param {*} folderId 
     */
    getFolderId: async function (folderId) {
        try {
            const mcAuthResults = await getMcAuth();
            const serviceUrl = `${validateUrl(MC_REST_BASE_URI)}${MC_CONTENT_CATEGORIES_API_PATH}${folderId}`;
            const res = await fetch(serviceUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mcAuthResults.access_token}`
                },
            });

            const response = await res.json();

            if (response && response.id == folderId) {
                return { id: folderId };
            } else {
                mcFolderRes = await getIdFromServer();
                if (mcFolderRes && mcFolderRes.id) {
                    return { id: mcFolderRes.id };
                } else if (mcFolderRes && mcFolderRes.status == 401) {
                    return { status: 401, errorMsg: MC_AUTH_FAILED_MSG };
                }
            }
        } catch (error) {
            console.log('Error in folder id:', error);
            return folderId;
        }
    },

    getFolderIdFromServer: async function(){
        return await getIdFromServer();
    }
    
}