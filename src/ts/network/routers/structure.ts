import { Router } from "./baseRouter";
import { ModuleLogger } from "../../utils/logger";

export const router = new Router("structureRouter");

/*
type Folder = {
  id: string;
  name: string;
  type: string;
  parent: string;
  depth: number;
  parentId: string | null;
  path: string;
  sorting: any;
  sortingMode: any;
};*/

type FolderWithRelations = {
  id: string;
  name: string;
  level: number;

  parentId: string | "none";
  parentName: string;
  parentLevel: number;

  childId: string | "none";
  childName: string;
  childLevel: number;
};

router.addRoute({
  actionType: "get-structure",
  handler: async (data, context) => {
    const socketManager = context?.socketManager;
    ModuleLogger.info(`Received structure request`);

    try {
      // Get all folders
      const folderList = (game as Game).folders?.contents || []
      const folders = Object.entries(folderList).map(([_, folder]) => {
      const folderTree: FolderWithRelations[] = walkUpTreeFromId(folderList,folder.id)
      
      let fullFolderPath =folderTree[1].name ?? folderTree[0].name ?? "root"
      for (let i = 2; i < folderTree.length; i++) { 
        fullFolderPath = fullFolderPath+"/"+folderTree[i].name;
        // work with item
      }

        return {
          id: folder.id,
          name: folder.name,
          type: folder.type,
          parent: (folder as any)._source?.folder ?? "root",
          depth: folder.depth,
          path: folder.uuid,
          sorting: (folder as any).sort,
          sortingMode: (folder as any).sortingMode,
          folderTree: folderTree,
          fullFolderPath: fullFolderPath
        };
      });

      // Get all compendiums
      const compendiums = (game as Game).packs.contents.map(pack => {
        return {
          id: pack.collection,
          name: pack.metadata.label,
          path: `Compendium.${pack.collection}`,
          entity: pack.documentName,
          package: pack.metadata.package,
          packageType: pack.metadata.type,
          system: pack.metadata.system
        };
      });

      socketManager?.send({
        type: "structure-data",
        requestId: data.requestId,
        folders,
        compendiums
      });
    } catch (error) {
      ModuleLogger.error(`Error getting structure:`, error);
      socketManager?.send({
        type: "structure-data",
        requestId: data.requestId,
        error: (error as Error).message,
        folders: [],
        compendiums: []
      });
    }
  }
});

router.addRoute({
  actionType: "get-contents",
  handler: async (data, context) => {
    const socketManager = context?.socketManager;
    ModuleLogger.info(`Received contents request for path: ${data.path}`);

    try {
      let contents = [];

      if (data.path.startsWith("Compendium.")) {
        // Handle compendium path
        const pack = (game as Game).packs.get(data.path.replace("Compendium.", ""));
        if (!pack) {
          throw new Error(`Compendium not found: ${data.path}`);
        }

        // Get the index if not already loaded
        const index = await pack.getIndex();

        // Return entries from the index
        contents = index.contents.map(entry => {
          return {
            uuid: `${pack.collection}.${entry._id}`,
            id: entry._id,
            name: entry.name,
            img: 'img' in entry ? entry.img : null,
            type: 'type' in entry ? entry.type : null
          };
        });
      } else {
        // Handle folder path
        // Extract folder ID from path like "Folder.abcdef12345"
        const folderMatch = data.path.match(/Folder\.([a-zA-Z0-9]+)/);
        if (!folderMatch) {
          throw new Error(`Invalid folder path: ${data.path}`);
        }

        const folderId = folderMatch[1];
        const folder = (game as Game).folders?.get(folderId);

        if (!folder) {
          throw new Error(`Folder not found: ${data.path}`);
        }

        // Get entities in folder
        contents = folder.contents.map(entity => {
          return {
            uuid: entity.uuid,
            id: entity.id,
            name: entity.name,
            img: 'img' in entity ? entity.img : null,
            type: entity.documentName
          };
        });
      }

      socketManager?.send({
        type: "contents-data",
        requestId: data.requestId,
        path: data.path,
        entities: contents
      });
    } catch (error) {
      ModuleLogger.error(`Error getting contents:`, error);
      socketManager?.send({
        type: "contents-data",
        requestId: data.requestId,
        path: data.path,
        error: (error as Error).message,
        entities: []
      });
    }
  }
});

function walkUpTreeFromId(folders: any[], startId: string): FolderWithRelations[] {
  const folderMap = new Map<string, any>();
  for (const folderObj of folders) {
    // create a map with unique key = folderID and the corresponding folder object
    folderMap.set(folderObj.id, folderObj);
  }

  const result: FolderWithRelations[] = [];
  //get the folder object with it's id
  let current = folderMap.get(startId);
  let child: any | null = null;

  if (!current) {
    return result; // startId not found
  }

  // Walk up the tree, collecting folders with their parent and child info
  while (current) {
    const parent: any = current._source?.folder ? folderMap.get(current._source?.folder) ?? null : null;

    
    result.push({
      id: current._id,
      name: current.name,
      level: current.depth,

      parentId: parent ? parent._id : "root",
      parentName: parent ? parent.name : "root",
      parentLevel: parent ? parent.depth : 0,

      childId: child ? child._id : "none",
      childName: child ? child.name : "none",
      childLevel: child ? child.depth : -1,
    });

    child = current;
    current = parent;

    if (current && current.depth < 0) {
      break;
    }
  }

  // Reverse the array so it starts with the root-level folder first (lowest level)
  result.reverse();

  // Insert the root object at index 0
  // Child information comes from the first element of reversed array, if any
  const firstChild = result.length > 0 ? result[0] : null;
  const rootObj: FolderWithRelations = {
    id: "root",
    name: "root",
    level: 0,

    parentId: "none",
    parentName: "none",
    parentLevel: -1,

    childId: firstChild ? firstChild.id : "none",
    childName: firstChild ? firstChild.name : "none",
    childLevel: firstChild ? firstChild.level : -1,
  };

  result.unshift(rootObj);

  return result;
}
