package com.bugtracker.service;

import com.bugtracker.model.Bug;
import com.bugtracker.repository.BugRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class BugService {
    private final BugRepository bugRepository;

    /**
     * Get all bugs
     */
    public List<Bug> getAllBugs() {
        return bugRepository.findAll();
    }

    /**
     * Get bug by ID
     */
    public Optional<Bug> getBugById(Long id) {
        return bugRepository.findById(id);
    }

    /**
     * Create a new bug
     */
    @Transactional
    public Bug createBug(Bug bug) {
        return bugRepository.save(bug);
    }

    /**
     * Update an existing bug
     */
    @Transactional
    public Bug updateBug(Long id, Bug bugDetails) {
        Bug bug = bugRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Bug not found with id: " + id));
        
        bug.setTitle(bugDetails.getTitle());
        bug.setDescription(bugDetails.getDescription());
        bug.setStatus(bugDetails.getStatus());
        bug.setPriority(bugDetails.getPriority());
        bug.setAssignedTo(bugDetails.getAssignedTo());
        
        return bugRepository.save(bug);
    }

    /**
     * Delete a bug
     */
    @Transactional
    public void deleteBug(Long id) {
        bugRepository.deleteById(id);
    }

    /**
     * Get bugs by status
     */
    public List<Bug> getBugsByStatus(String status) {
        return bugRepository.findByStatus(status);
    }

    /**
     * Get bugs by priority
     */
    public List<Bug> getBugsByPriority(String priority) {
        return bugRepository.findByPriority(priority);
    }

    /**
     * Get bugs assigned to a user
     */
    public List<Bug> getBugsByAssignedTo(String assignedTo) {
        return bugRepository.findByAssignedTo(assignedTo);
    }
}