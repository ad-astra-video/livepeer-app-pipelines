import React, { useState, useEffect } from 'react'
import { 
  Box, 
  Drawer, 
  IconButton, 
  TextField, 
  Button, 
  Typography, 
  Slider, 
  FormControlLabel, 
  Checkbox,
  InputAdornment,
  CircularProgress,
  Divider,
  Tooltip,
  useMediaQuery,
  useTheme
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import { enhancePrompt } from '../services/api'

const Sidebar = ({ open, setOpen, onGenerate, isLoading, settings }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  
  // Adjust drawer width based on screen size
  const drawerWidth = isMobile ? '100%' : 300
  
  const [formData, setFormData] = useState({
    prompt: '',
    negative_prompt: '',
    num_inference_steps: 2,
    guidance_scale: 4.5,
    seed: '',
    num_images_per_prompt: 1,
    use_random_seed: true
  })
  const [enhancingPrompt, setEnhancingPrompt] = useState(false)

  // Reset the seed when use_random_seed changes
  useEffect(() => {
    if (formData.use_random_seed) {
      setFormData(prev => ({ ...prev, seed: '' }))
    }
  }, [formData.use_random_seed])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSliderChange = (name) => (e, newValue) => {
    setFormData(prev => ({ ...prev, [name]: newValue }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onGenerate(formData)
    // On mobile, close the sidebar after generating
    if (isMobile) {
      setOpen(false)
    }
  }

  const handleEnhancePrompt = async () => {
    if (!formData.prompt.trim()) return
    
    try {
      setEnhancingPrompt(true)
      const enhancedPrompt = await enhancePrompt(
        formData.prompt, 
        settings?.apiBaseUrl || '', 
        settings?.timeout || 5
      )
      setFormData(prev => ({ ...prev, prompt: enhancedPrompt }))
    } catch (error) {
      console.error('Error enhancing prompt:', error)
      // Could add error handling UI here
    } finally {
      setEnhancingPrompt(false)
    }
  }

  return (
    <Drawer
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          // For mobile, make drawer take full height
          height: isMobile ? '100%' : 'auto',
        },
      }}
      variant="temporary"
      anchor="left"
      open={open}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', p: 2, justifyContent: 'space-between' }}>
        <Typography variant="h6" component="div">
          Image Generator
        </Typography>
        <IconButton onClick={() => setOpen(false)}>
          <ChevronLeftIcon />
        </IconButton>
      </Box>
      
      <Divider />
      
      <Box 
        component="form" 
        onSubmit={handleSubmit} 
        sx={{ 
          p: 2,
          overflow: 'auto',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <TextField
          fullWidth
          label="Prompt"
          name="prompt"
          value={formData.prompt}
          onChange={handleChange}
          margin="normal"
          multiline
          rows={isMobile ? 4 : 8}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Enhance prompt">
                  <IconButton 
                    edge="end" 
                    onClick={handleEnhancePrompt}
                    disabled={enhancingPrompt || !formData.prompt.trim()}
                  >
                    {enhancingPrompt ? <CircularProgress size={24} /> : <AutoFixHighIcon />}
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
            style: { fontSize: '0.875rem' } // Smaller font size for the input text
          }}
          InputLabelProps={{
            style: { fontSize: '0.875rem' } // Smaller font size for the label
          }}
        />
        
        <TextField
          fullWidth
          label="Negative Prompt"
          name="negative_prompt"
          value={formData.negative_prompt}
          onChange={handleChange}
          margin="normal"
          multiline
          rows={isMobile ? 2 : 2}
          InputProps={{
            style: { fontSize: '0.875rem' } // Smaller font size for the input text
          }}
          InputLabelProps={{
            style: { fontSize: '0.875rem' } // Smaller font size for the label
          }}
        />
        
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>
            Steps: {formData.num_inference_steps}
          </Typography>
          <Slider
            value={formData.num_inference_steps}
            onChange={handleSliderChange('num_inference_steps')}
            min={1}
            max={50}
            step={1}
            valueLabelDisplay="auto"
            size={isMobile ? "small" : "medium"}
          />
        </Box>
        
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>
            CFG Scale: {formData.guidance_scale}
          </Typography>
          <Slider
            value={formData.guidance_scale}
            onChange={handleSliderChange('guidance_scale')}
            min={1}
            max={20}
            step={0.1}
            valueLabelDisplay="auto"
            size={isMobile ? "small" : "medium"}
          />
        </Box>
        
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>
            Number of Images: {formData.num_images_per_prompt}
          </Typography>
          <Slider
            value={formData.num_images_per_prompt}
            onChange={handleSliderChange('num_images_per_prompt')}
            min={1}
            max={isMobile ? 20 : 100}
            step={1}
            marks={!isMobile}
            valueLabelDisplay="auto"
            size={isMobile ? "small" : "medium"}
          />
        </Box>
        
        <FormControlLabel
          control={
            <Checkbox
              checked={formData.use_random_seed}
              onChange={handleChange}
              name="use_random_seed"
              size={isMobile ? "small" : "medium"}
            />
          }
          label={<Typography variant="body2">Use random seed</Typography>}
          sx={{ mt: 1 }}
        />
        
        {!formData.use_random_seed && (
          <TextField
            fullWidth
            label="Seed"
            name="seed"
            value={formData.seed}
            onChange={(e) => {
              // Convert to integer and handle empty string
              const value = e.target.value === '' ? '' : parseInt(e.target.value, 10);
              setFormData(prev => ({ ...prev, seed: value }));
            }}
            margin="normal"
            type="number"
            inputProps={{ min: 0, max: 9999999999 }}
            size={isMobile ? "small" : "medium"}
          />
        )}
        
        <Box sx={{ mt: 'auto', pt: 2 }}>
          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{ mt: 1 }}
            disabled={isLoading || !formData.prompt.trim()}
            size={isMobile ? "large" : "medium"}
          >
            {isLoading ? (
              <>
                <CircularProgress size={24} sx={{ mr: 1 }} color="inherit" />
                Generating...
              </>
            ) : (
              'Generate'
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  )
}

export default Sidebar
