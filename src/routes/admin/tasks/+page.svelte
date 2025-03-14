<script lang="ts">
// LIB
import { ADMIN_PATH } from '$lib/index';
// import {
//   resources,
//   fetchResources,
//   queryFilterParams
// } from '$lib/stores/resources.svelte';
// SVELTE
import { onMount } from 'svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';

// STATE : CONTEXT :: RESOURCES
const resourceState = getHierarchicalResourceState();
</script>

<div class="p-4">
  <h1 class="mb-4 text-2xl font-bold">Tasks</h1>

  <div class="mb-4 flex items-center justify-between">
    <div class="form-control">
      <label class="label cursor-pointer">
        <span class="label-text mr-2">Show reviewed tasks</span>
        <input
          type="checkbox"
          class="toggle toggle-primary"
          checked={resourceState.state.filters.task.isReviewed}
          on:change={() =>
            resourceState.toggleFilter(HierarchicalResource.task, 'isReviewed')} />
      </label>
    </div>

    <button class="btn btn-primary">Create Task</button>
  </div>

  <div class="overflow-x-auto">
    <table class="table w-full">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Assigned To</th>
          <th>Due Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each resourceState.filteredTask as task}
          <tr>
            <!-- TODO implement task name -->
            <td>{task.feature?.title || 'Unnamed Feature'}</td>
            <td>
              <div
                class="badge {task.status === 'completed'
                  ? 'badge-success'
                  : task.status === 'in-progress'
                    ? 'badge-warning'
                    : 'badge-info'}">
                {task.status || 'pending'}
              </div>
            </td>
            <td>{task.assignedTo || 'Unassigned'}</td>
            <td
              >{task.dueDate
                ? new Date(task.dueDate).toLocaleDateString()
                : 'No due date'}</td>
            <td>
              <a
                href="{ADMIN_PATH}/{resourceState.getEntityPath(
                  HierarchicalResource.task,
                  task.id
                )}"
                class="btn btn-sm">View</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
