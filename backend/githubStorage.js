const { Octokit } = require("@octokit/rest");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "Viktor-DTS";
const REPO_NAME = "darex-trading-solutions";
const BRANCH = "main";

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function getFile(path) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: BRANCH,
    });
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { content, sha: data.sha };
  } catch (error) {
    if (error.status === 404) return { content: null, sha: null };
    throw error;
  }
}

async function createOrUpdateFile(path, content, message) {
  const { sha } = await getFile(path);
  const params = {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) params.sha = sha;
  await octokit.repos.createOrUpdateFileContents(params);
}

module.exports = {
  getFile,
  createOrUpdateFile,
}; 