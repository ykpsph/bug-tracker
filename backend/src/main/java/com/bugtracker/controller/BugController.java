package com.bugtracker.controller;

import com.bugtracker.dto.BugRequest;
import com.bugtracker.model.Bug;
import com.bugtracker.service.BugService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/bugs")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class BugController {
    private final BugService bugService;

    /**
     * Get all bugs
     */
    @GetMapping
    public ResponseEntity<List<Bug>> getAllBugs() {
        return ResponseEntity.ok(bugService.getAllBugs());
    }

    /**
     * Get bug by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<Bug> getBugById(@PathVariable Long id) {
        return bugService.getBugById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Create a new bug
     */
    @PostMapping
    public ResponseEntity<Bug> createBug(@Valid @RequestBody BugRequest bugRequest) {
        Bug bug = new Bug();
        bug.setTitle(bugRequest.getTitle());
        bug.setDescription(bugRequest.getDescription());
        bug.setStatus(bugRequest.getStatus());
        bug.setPriority(bugRequest.getPriority());
        bug.setAssignedTo(bugRequest.getAssignedTo());
        
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(bugService.createBug(bug));
    }

    /**
     * Update a bug
     */
    @PutMapping("/{id}")
    public ResponseEntity<Bug> updateBug(@PathVariable Long id, 
                                         @Valid @RequestBody BugRequest bugRequest) {
        Bug bug = new Bug();
        bug.setTitle(bugRequest.getTitle());
        bug.setDescription(bugRequest.getDescription());
        bug.setStatus(bugRequest.getStatus());
        bug.setPriority(bugRequest.getPriority());
        bug.setAssignedTo(bugRequest.getAssignedTo());
        
        return ResponseEntity.ok(bugService.updateBug(id, bug));
    }

    /**
     * Delete a bug
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteBug(@PathVariable Long id) {
        bugService.deleteBug(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Get bugs by status
     */
    @GetMapping("/status/{status}")
    public ResponseEntity<List<Bug>> getBugsByStatus(@PathVariable String status) {
        return ResponseEntity.ok(bugService.getBugsByStatus(status));
    }

    /**
     * Get bugs by priority
     */
    @GetMapping("/priority/{priority}")
    public ResponseEntity<List<Bug>> getBugsByPriority(@PathVariable String priority) {
        return ResponseEntity.ok(bugService.getBugsByPriority(priority));
    }
}