import { gql } from 'graphql-tag';

export const CREATE_PROJECT = gql`
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      success
      message
      document {
        id
        name
        path
        port
        status
        autoStart
        createdAt
        updatedAt
      }
    }
  }
`;

export const RUN_PROJECT = gql`
  mutation RunProject($input: RunProjectInput!) {
    runProject(input: $input) {
      success
      message
      document {
        id
        status
        runtime {
          pid
          startedAt
          driveUrl
        }
      }
    }
  }
`;

export const STOP_PROJECT = gql`
  mutation StopProject($input: StopProjectInput!) {
    stopProject(input: $input) {
      success
      message
      document {
        id
        status
        runtime {
          pid
          startedAt
          driveUrl
        }
      }
    }
  }
`;

export const DELETE_PROJECT = gql`
  mutation DeleteProject($input: DeleteProjectInput!) {
    deleteProject(input: $input) {
      success
      message
    }
  }
`;

export const UPDATE_PROJECT_STATUS = gql`
  mutation UpdateProjectStatus($input: UpdateProjectStatusInput!) {
    updateProjectStatus(input: $input) {
      success
      message
      document {
        id
        status
      }
    }
  }
`;

export const UPDATE_PROJECT_RUNTIME = gql`
  mutation UpdateProjectRuntime($input: UpdateProjectRuntimeInput!) {
    updateProjectRuntime(input: $input) {
      success
      message
      document {
        id
        runtime {
          pid
          startedAt
          driveUrl
        }
      }
    }
  }
`;

export const UPDATE_PROJECT_CONFIG = gql`
  mutation UpdateProjectConfig($input: UpdateProjectConfigInput!) {
    updateProjectConfig(input: $input) {
      success
      message
      document {
        id
        port
        autoStart
        commandTimeout
      }
    }
  }
`;

export const ADD_LOG_ENTRY = gql`
  mutation AddLogEntry($input: AddLogEntryInput!) {
    addLogEntry(input: $input) {
      success
      message
      document {
        id
        logs {
          id
          timestamp
          level
          message
          source
          metadata
        }
      }
    }
  }
`;

export const REGISTER_PROJECT = gql`
  mutation RegisterProject($driveId: String, $docId: PHID, $input: AgentProjects_RegisterProjectInput) {
    AgentProjects_registerProject(driveId: $driveId, docId: $docId, input: $input)
  }
`;

export const GET_PROJECT = gql`
  query GetProject($id: String!) {
    getDocument(id: $id) {
      id
      name
      path
      port
      status
      autoStart
      commandTimeout
      runtime {
        pid
        startedAt
        driveUrl
      }
      logs {
        id
        timestamp
        level
        message
        source
        metadata
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_ALL_PROJECTS = gql`
  query GetAllProjects {
    getDocuments {
      id
      name
      path
      port
      status
      autoStart
      runtime {
        pid
        startedAt
        driveUrl
      }
      createdAt
      updatedAt
    }
  }
`;