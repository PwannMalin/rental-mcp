// src/tools/get-rental.js
// src/tools/get-rental.js

// src/tools/get-rental.js

import { lfRequest } from "../laserfiche/client.js";

export async function getRental(id) {

  const repositoryId =
    process.env.REPOSITORY_ID;

  const children =
    await lfRequest(
      `/Repositories/${repositoryId}/Entries/${id}/Folder/Children`
    );

  return children.value;
}